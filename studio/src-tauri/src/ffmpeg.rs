//! The only thing the Rust side owns: one ffmpeg process that takes the
//! webview's composited MediaRecorder output on stdin and pushes it to every
//! enabled RTMP destination.
//!
//! Everything visual (scenes, layers, lyrics) happens on a canvas in the
//! webview — switching scenes is just drawing something else, so the encoder
//! and the RTMP connections never restart mid-broadcast.

use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::fs;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{sync_channel, SyncSender, TrySendError};
use std::sync::{Arc, Mutex};
use std::thread;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

/// Chunks buffered between the webview and ffmpeg's stdin. MediaRecorder emits
/// one per timeslice (~250 ms), so this is ~30 s of slack. A full queue applies
/// backpressure; encoded WebM chunks must never be discarded because one chunk
/// can contain reference video frames and audio from the same time range.
const CHUNK_QUEUE: usize = 120;
/// stderr lines kept so a crash can be explained instead of just reported.
const LOG_TAIL: usize = 40;

#[derive(Debug, Clone, Deserialize)]
pub struct Target {
	pub name: String,
	/// Full ingest URL including the stream key, e.g.
	/// `rtmp://a.rtmp.youtube.com/live2/xxxx-xxxx`.
	pub url: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StreamConfig {
	/// Container MediaRecorder actually produced — the webview probes support
	/// and tells us, we don't guess. "webm" or "mp4".
	pub container: String,
	pub targets: Vec<Target>,
	pub fps: u32,
	pub video_bitrate_kbps: u32,
	pub audio_bitrate_kbps: u32,
	/// "hardware" (VideoToolbox on macOS) or "software" (libx264).
	pub encoder: String,
	pub has_audio: bool,
	pub record_local: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct FfmpegInfo {
	pub path: String,
	pub version: String,
	pub hardware_h264: bool,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct StreamStats {
	pub frames: u64,
	pub fps: f64,
	pub bitrate_kbps: f64,
	pub out_time_ms: u64,
	pub dropped_frames: u64,
	pub speed: f64,
	/// Bytes handed to the muxers so far — OBS's "total data output".
	pub total_bytes: u64,
	/// Times the input queue filled and the producer had to wait for ffmpeg.
	/// No media is discarded; this remains the operator's congestion signal.
	pub backpressure_events: u64,
}

struct Running {
	tx: Option<SyncSender<Vec<u8>>>,
	child: Arc<Mutex<Child>>,
	backpressure: Arc<AtomicU64>,
}

/// Encoders run in named groups so a destination can be held back without
/// touching the one already on air. `main` starts with Start Streaming; a
/// held group (YouTube, typically) starts only when the operator says so, and
/// gets its own ffmpeg fed the same chunks — adding an output to a running
/// ffmpeg is not possible, and restarting it would drop the congregation's
/// stream to add a public one.
#[derive(Default)]
pub struct Encoder {
	groups: Mutex<HashMap<String, Running>>,
	/// The first chunk MediaRecorder produced this session: the EBML header,
	/// segment and track definitions. An encoder started later would otherwise
	/// be handed a WebM stream beginning in the middle, which ffmpeg cannot
	/// parse at all — it exits immediately. Replaying the header first is what
	/// lets a held destination join a recording already in progress.
	header: Mutex<Option<Vec<u8>>>,
}

// ── ffmpeg discovery ──────────────────────────────────────────────
// A macOS .app is launched by Finder, which does not source a login shell, so
// /opt/homebrew/bin is missing from PATH. Look there explicitly.
const FFMPEG_CANDIDATES: &[&str] = &[
	"/opt/homebrew/bin/ffmpeg",
	"/usr/local/bin/ffmpeg",
	"/usr/bin/ffmpeg",
	"/opt/local/bin/ffmpeg",
];

pub fn resolve_ffmpeg() -> Result<PathBuf, String> {
	if let Ok(explicit) = std::env::var("FFMPEG_PATH") {
		let p = PathBuf::from(explicit);
		if p.is_file() {
			return Ok(p);
		}
	}
	for candidate in FFMPEG_CANDIDATES {
		let p = PathBuf::from(candidate);
		if p.is_file() {
			return Ok(p);
		}
	}
	// Last resort: whatever PATH we did inherit (covers `pnpm studio` from a
	// terminal, and Linux/Windows installs).
	if Command::new("ffmpeg")
		.arg("-version")
		.stdout(Stdio::null())
		.stderr(Stdio::null())
		.status()
		.is_ok()
	{
		return Ok(PathBuf::from("ffmpeg"));
	}
	Err("ffmpeg introuvable. Installez-le (brew install ffmpeg) ou définissez FFMPEG_PATH.".into())
}

pub fn probe_ffmpeg() -> Result<FfmpegInfo, String> {
	let path = resolve_ffmpeg()?;
	let out = Command::new(&path)
		.args(["-hide_banner", "-encoders"])
		.output()
		.map_err(|e| format!("ffmpeg illisible: {e}"))?;
	let encoders = String::from_utf8_lossy(&out.stdout);

	let version_out = Command::new(&path)
		.arg("-version")
		.output()
		.map_err(|e| format!("ffmpeg illisible: {e}"))?;
	let version = String::from_utf8_lossy(&version_out.stdout)
		.lines()
		.next()
		.unwrap_or("ffmpeg")
		.to_string();

	Ok(FfmpegInfo {
		path: path.to_string_lossy().to_string(),
		version,
		hardware_h264: encoders.contains("h264_videotoolbox") || encoders.contains("h264_nvenc"),
	})
}

/// Which target (if any) an ffmpeg stderr line is complaining about, and the
/// reason. `tee` numbers its slaves in the order they were listed.
pub fn parse_target_failure(line: &str, single_target: bool) -> Option<(usize, String)> {
	// tee: "Slave muxer #1 failed: Connection refused, continuing with 1/2 slaves."
	if let Some(rest) = line.split("Slave muxer #").nth(1) {
		let mut parts = rest.splitn(2, ' ');
		let index: usize = parts.next()?.trim().parse().ok()?;
		let reason = parts
			.next()
			.unwrap_or("failed")
			.trim_start_matches("failed:")
			.trim()
			.trim_end_matches('.')
			.to_string();
		return Some((index, reason));
	}
	// Single destination: there is no tee, so a connection error is target 0.
	if single_target
		&& (line.contains("Cannot open connection")
			|| line.contains("Connection refused")
			|| line.contains("Connection timed out")
			|| line.contains("Server returned 4"))
	{
		return Some((0, line.trim().to_string()));
	}
	None
}

// ── argument building ─────────────────────────────────────────────

/// Reject anything that could add an output or a flag we did not intend.
/// `|` and `[` `]` are tee-muxer syntax: a key containing one would turn a
/// single destination into two. Values come from the operator's own settings,
/// but they are typed in and pasted, so this is a real boundary.
fn validate_url(url: &str) -> Result<(), String> {
	let scheme_ok = url.starts_with("rtmp://") || url.starts_with("rtmps://");
	if !scheme_ok {
		return Err(format!("URL non supportée (rtmp:// ou rtmps:// attendu) : {url}"));
	}
	if url.len() > 2048 {
		return Err("URL trop longue".into());
	}
	for c in url.chars() {
		if c.is_control() || c.is_whitespace() || matches!(c, '|' | '[' | ']' | '\'' | '"' | '\\') {
			return Err(format!("Caractère interdit dans l'URL de diffusion : {c:?}"));
		}
	}
	Ok(())
}

pub fn build_args(cfg: &StreamConfig) -> Result<Vec<String>, String> {
	build_args_with_path(cfg, None)
}

fn build_args_with_path(cfg: &StreamConfig, local_path: Option<&str>) -> Result<Vec<String>, String> {
	if cfg.targets.is_empty() && local_path.is_none() {
		return Err("Aucune destination activée".into());
	}
	for t in &cfg.targets {
		validate_url(&t.url).map_err(|e| format!("{} — {e}", t.name))?;
	}
	let container = match cfg.container.as_str() {
		"webm" => "webm",
		"mp4" => "mp4",
		other => return Err(format!("Conteneur inconnu: {other}")),
	};
	let fps = cfg.fps.clamp(10, 60);
	let vk = cfg.video_bitrate_kbps.clamp(300, 20_000);
	let ak = cfg.audio_bitrate_kbps.clamp(48, 320);

	let mut a: Vec<String> = Vec::new();
	macro_rules! push {
		($($v:expr),+ $(,)?) => { $( a.push($v.to_string()); )+ };
	}

	push!("-hide_banner", "-loglevel", "warning", "-nostdin");
	// MediaRecorder timestamps restart oddly across pauses; let ffmpeg rebuild
	// a monotonic timeline instead of dropping frames on the way in.
	push!("-fflags", "+genpts", "-thread_queue_size", "512");
	push!("-f", container, "-i", "pipe:0");
	// `0:a:0?` — optional: a scene with no audio source must still stream.
	push!("-map", "0:v:0", "-map", "0:a:0?");

	if cfg.encoder == "software" {
		// Live: no B-frames, no lookahead. Latency over compression ratio.
		push!("-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency");
		push!("-profile:v", "high", "-sc_threshold", "0", "-refs", "1");
		push!("-x264-params", "nal-hrd=cbr:force-cfr=1");
	} else {
		// `-allow_sw 1` falls back inside VideoToolbox rather than dying if the
		// GPU session cannot be created (happens under screen sharing).
		push!("-c:v", "h264_videotoolbox", "-realtime", "1", "-allow_sw", "1");
		push!("-constant_bit_rate", "1", "-prio_speed", "1", "-max_ref_frames", "1");
		push!("-profile:v", "high");
	}
	push!("-pix_fmt", "yuv420p");
	push!(
		"-colorspace",
		"bt709",
		"-color_primaries",
		"bt709",
		"-color_trc",
		"bt709"
	);
	push!("-b:v", format!("{vk}k"), "-minrate", format!("{vk}k"));
	push!("-maxrate", format!("{vk}k"), "-bufsize", format!("{}k", vk * 2));
	// 2-second keyframe interval: what YouTube asks for, and what keeps the
	// HLS packager on the Fly box cutting clean segments.
	push!("-r", fps, "-g", fps * 2, "-keyint_min", fps);

	if cfg.has_audio {
		// Correct small WebAudio/MediaRecorder clock drift without changing pitch.
		push!("-af", "aresample=async=1000:first_pts=0");
	}
	push!("-c:a", "aac", "-b:a", format!("{ak}k"), "-ar", "48000", "-ac", "2");
	push!("-nostats", "-progress", "pipe:1");

	// Each RTMP destination gets an independent packet queue and reconnect loop.
	// Two backslashes are intentional: tee parses the slave options first, then
	// the nested fifo dictionary. This keeps a slow destination from blocking
	// every other destination or backing up the WebM input pipe.
	const FIFO_OPTIONS: &str = concat!(
		r"attempt_recovery\\=1\\:recover_any_error\\=1\\:recovery_wait_time\\=1",
		r"\\:restart_with_keyframe\\=1\\:queue_size\\=600\\:drop_pkts_on_overflow\\=1"
	);
	let mut outputs = cfg
		.targets
		.iter()
		.map(|t| {
			format!(
				"[f=flv:flvflags=no_duration_filesize:onfail=ignore:use_fifo=1:fifo_options={FIFO_OPTIONS}]{}",
				t.url
			)
		})
		.collect::<Vec<_>>();
	if let Some(path) = local_path {
		outputs.push(format!("[f=mp4:movflags=+frag_keyframe+empty_moov]{}", path));
	}
	if cfg.targets.is_empty() {
		push!("-movflags", "+frag_keyframe+empty_moov", "-f", "mp4", local_path.unwrap());
	} else {
		// tee fans one encode out to every destination. `onfail=ignore` is the
		// point: YouTube rejecting the key must not take the church's own
		// stream down with it.
		push!("-flags", "+global_header", "-f", "tee");
		push!(outputs.join("|"));
	}
	Ok(a)
}

/// Same args, with every stream key replaced by `***` — for logs and for the
/// "show me the command" panel in the UI.
pub fn redact(args: &[String]) -> Vec<String> {
	args.iter()
		.map(|arg| {
			if !arg.contains("rtmp://") && !arg.contains("rtmps://") {
				return arg.clone();
			}
			arg.split('|')
				.map(|part| match part.rsplit_once('/') {
					Some((head, key)) if !key.is_empty() => format!("{head}/***"),
					_ => part.to_string(),
				})
				.collect::<Vec<_>>()
				.join("|")
		})
		.collect()
}

// ── lifecycle ─────────────────────────────────────────────────────

impl Encoder {
	pub fn is_running(&self) -> bool {
		self.groups.lock().map(|g| !g.is_empty()).unwrap_or(false)
	}

	pub fn start(
		&self,
		app: &AppHandle,
		cfg: StreamConfig,
		group: &str,
	) -> Result<(Vec<String>, Option<String>), String> {
		let mut guard = self.groups.lock().map_err(|e| e.to_string())?;
		if guard.contains_key(group) {
			return Err("Cette diffusion est déjà en cours".into());
		}
		// First encoder of a session: the recorder is about to be created, so
		// the header we are holding belongs to the previous one.
		if guard.is_empty() {
			if let Ok(mut header) = self.header.lock() {
				*header = None;
			}
		}
		let bin = resolve_ffmpeg()?;
		let local_path = if cfg.record_local {
			let base = std::env::var("HOME").map(PathBuf::from).unwrap_or(std::env::current_dir().map_err(|e| e.to_string())?);
			let dir = base.join("Movies").join("Missionnaire Studio");
			fs::create_dir_all(&dir).map_err(|e| format!("Dossier d’enregistrement impossible: {e}"))?;
			Some(dir.join(format!("Missionnaire Studio {}.mp4", chrono_stamp())).to_string_lossy().to_string())
		} else { None };
		let args = build_args_with_path(&cfg, local_path.as_deref())?;

		let mut child = Command::new(&bin)
			.args(&args)
			.stdin(Stdio::piped())
			.stdout(Stdio::piped())
			.stderr(Stdio::piped())
			.spawn()
			.map_err(|e| format!("Lancement de ffmpeg impossible: {e}"))?;

		let mut stdin = child.stdin.take().ok_or("stdin ffmpeg indisponible")?;
		let stdout = child.stdout.take().ok_or("stdout ffmpeg indisponible")?;
		let stderr = child.stderr.take().ok_or("stderr ffmpeg indisponible")?;

		let (tx, rx) = sync_channel::<Vec<u8>>(CHUNK_QUEUE);
		let backpressure = Arc::new(AtomicU64::new(0));

		// Writer thread. Each destination is isolated later by ffmpeg's fifo
		// muxer, so this input pipe normally drains continuously. If the encoder
		// itself falls behind, the bounded queue applies lossless backpressure.
		thread::spawn(move || {
			for chunk in rx {
				if stdin.write_all(&chunk).is_err() {
					break; // ffmpeg gone; the stderr reader reports why.
				}
			}
			// Dropping stdin closes the pipe → ffmpeg flushes and exits cleanly.
		});

		// Progress reader: `-progress pipe:1` emits key=value blocks terminated
		// by `progress=continue`.
		let app_stats = app.clone();
		let group_stats = group.to_string();
		let backpressure_stats = backpressure.clone();
		thread::spawn(move || {
			let mut stats = StreamStats::default();
			for line in BufReader::new(stdout).lines().map_while(Result::ok) {
				let Some((key, value)) = line.split_once('=') else { continue };
				let value = value.trim();
				match key {
					"frame" => stats.frames = value.parse().unwrap_or(stats.frames),
					"fps" => stats.fps = value.parse().unwrap_or(stats.fps),
					"bitrate" => {
						stats.bitrate_kbps = value
							.trim_end_matches("kbits/s")
							.trim()
							.parse()
							.unwrap_or(stats.bitrate_kbps)
					}
					"out_time_ms" => {
						stats.out_time_ms = value.parse::<u64>().unwrap_or(0) / 1000;
					}
					"drop_frames" => {
						stats.dropped_frames = value.parse().unwrap_or(stats.dropped_frames)
					}
					"total_size" => stats.total_bytes = value.parse().unwrap_or(stats.total_bytes),
					"speed" => {
						stats.speed = value.trim_end_matches('x').parse().unwrap_or(stats.speed)
					}
					"progress" => {
						stats.backpressure_events = backpressure_stats.load(Ordering::Relaxed);
						let _ = app_stats.emit(
							"stream://stats",
							serde_json::json!({ "group": group_stats, "stats": stats.clone() }),
						);
					}
					_ => {}
				}
			}
		});

		// stderr reader: surfaces ffmpeg's own words, and the exit reason.
		let target_count = cfg.targets.len();
		let app_log = app.clone();
		let group_log = group.to_string();
		let child_handle = Arc::new(Mutex::new(child));
		let child_wait = child_handle.clone();
		thread::spawn(move || {
			let mut tail: VecDeque<String> = VecDeque::with_capacity(LOG_TAIL);
			for line in BufReader::new(stderr).lines().map_while(Result::ok) {
				if tail.len() == LOG_TAIL {
					tail.pop_front();
				}
				tail.push_back(line.clone());
				if let Some((index, reason)) = parse_target_failure(&line, target_count == 1) {
					let _ = app_log.emit(
						"stream://target",
						serde_json::json!({
							"group": group_log,
							"index": index,
							"state": "failed",
							"reason": reason
						}),
					);
				}
				let _ = app_log.emit("stream://log", line);
			}
			// stderr closed → the process is on its way out. Reap it and tell
			// the UI, so a dead encoder can never look "live".
			let status = child_wait.lock().ok().and_then(|mut c| c.wait().ok());
			let code = status.and_then(|s| s.code()).unwrap_or(-1);
			let _ = app_log.emit(
				"stream://exited",
				serde_json::json!({
					"group": group_log,
					"code": code,
					"log": tail.iter().cloned().collect::<Vec<_>>(),
				}),
			);
		});

		// A group joining a session already under way needs the stream's opening
		// bytes before any cluster, or ffmpeg sees a headerless stream.
		if let Ok(header) = self.header.lock() {
			if let Some(bytes) = header.as_ref() {
				let _ = tx.try_send(bytes.clone());
			}
		}

		guard.insert(
			group.to_string(),
			Running {
				tx: Some(tx),
				child: child_handle,
				backpressure,
			},
		);
		Ok((redact(&args), local_path))
	}

	/// Every running group gets the same chunk. A group that has died is not
	/// allowed to fail the others — the held YouTube encoder dropping out must
	/// not take the church's own stream with it.
	pub fn push(&self, bytes: &[u8]) -> Result<(), String> {
		// ponytail: the whole first chunk is kept as the header. MediaRecorder
		// puts the EBML header and track definitions in it and starts clusters
		// after, so this is a little more than strictly needed but never less.
		// Parse the EBML properly if a held encoder ever starts on a bad frame.
		if let Ok(mut header) = self.header.lock() {
			if header.is_none() {
				*header = Some(bytes.to_vec());
			}
		}
		let runs = self
			.groups
			.lock()
			.map_err(|e| e.to_string())?
			.values()
			.filter_map(|run| run.tx.as_ref().map(|tx| (tx.clone(), run.backpressure.clone())))
			.collect::<Vec<_>>();
		// A chunk arriving after stop() is normal — MediaRecorder flushes one
		// last blob on its way down. Silently ignore it.
		for (tx, backpressure) in runs {
			match tx.try_send(bytes.to_vec()) {
				Ok(()) => {}
				Err(TrySendError::Full(chunk)) => {
					backpressure.fetch_add(1, Ordering::Relaxed);
					// Backpressure happens off the webview thread. Waiting is safe and
					// preserves the complete audio/video timeline; stop() can still take
					// the groups lock and kill a wedged child, which disconnects this send.
					let _ = tx.send(chunk);
				}
				Err(TrySendError::Disconnected(_)) => {}
			}
		}
		Ok(())
	}

	/// Stop one group, or every group when `group` is None.
	pub fn stop_group(&self, group: Option<&str>) -> Result<(), String> {
		let mut guard = self.groups.lock().map_err(|e| e.to_string())?;
		let names: Vec<String> = match group {
			Some(name) => vec![name.to_string()],
			None => guard.keys().cloned().collect()
		};
		for name in names {
			let Some(mut run) = guard.remove(&name) else { continue };
			Self::shut_down(&mut run);
		}
		Ok(())
	}

	pub fn stop(&self) -> Result<(), String> {
		self.stop_group(None)
	}

	fn shut_down(run: &mut Running) {
		// Drop the sender → writer thread finishes the queue, closes stdin,
		// ffmpeg writes its trailer and exits. The stderr thread reaps it.
		run.tx = None;
		// Give a wedged ffmpeg a hard stop rather than leaking the process.
		let child = run.child.clone();
		thread::spawn(move || {
			thread::sleep(std::time::Duration::from_secs(8));
			if let Ok(mut c) = child.lock() {
				if matches!(c.try_wait(), Ok(None)) {
					let _ = c.kill();
				}
			}
		});
	}
}

fn chrono_stamp() -> u64 {
	std::time::SystemTime::now()
		.duration_since(std::time::UNIX_EPOCH)
		.unwrap_or_default()
		.as_secs()
}

#[cfg(test)]
mod tests {
	use super::*;

	fn cfg(targets: &[&str]) -> StreamConfig {
		StreamConfig {
			container: "webm".into(),
			targets: targets
				.iter()
				.map(|u| Target { name: "t".into(), url: (*u).into() })
				.collect(),
			fps: 30,
			video_bitrate_kbps: 4500,
			audio_bitrate_kbps: 160,
			encoder: "hardware".into(),
			has_audio: true,
			record_local: false,
		}
	}

	#[test]
	fn single_target_uses_recovering_fifo() {
		let args = build_args(&cfg(&["rtmp://localhost:1935/live/obs"])).unwrap();
		assert!(args.iter().any(|a| a == "tee"));
		let spec = args.last().unwrap();
		assert!(spec.contains("use_fifo=1"));
		assert!(spec.contains("attempt_recovery"));
		assert!(spec.ends_with("rtmp://localhost:1935/live/obs"));
	}

	#[test]
	fn multi_target_tees_and_ignores_failures() {
		let args = build_args(&cfg(&[
			"rtmp://localhost:1935/live/obs",
			"rtmps://a.rtmp.youtube.com/live2/abcd",
		]))
		.unwrap();
		let spec = args.last().unwrap();
		assert_eq!(spec.matches("onfail=ignore").count(), 2);
		assert_eq!(spec.matches("use_fifo=1").count(), 2);
		assert!(spec.contains('|'));
	}

	#[test]
	fn rejects_pipe_injection_in_stream_key() {
		// A key containing tee syntax would silently add a third destination.
		let err = build_args(&cfg(&["rtmp://host/live/key|[f=flv]rtmp://evil/x"])).unwrap_err();
		assert!(err.starts_with("t — "), "target name should identify the bad entry: {err}");
		assert!(err.contains("interdit"));
	}

	#[test]
	fn rejects_non_rtmp_scheme() {
		assert!(build_args(&cfg(&["file:///etc/passwd"])).is_err());
		assert!(build_args(&cfg(&["http://example.com/x"])).is_err());
	}

	#[test]
	fn rejects_empty_targets() {
		assert!(build_args(&cfg(&[])).is_err());
	}

	#[test]
	fn clamps_absurd_bitrate_and_fps() {
		let mut c = cfg(&["rtmp://h/live/k"]);
		c.fps = 500;
		c.video_bitrate_kbps = 999_999;
		let args = build_args(&c).unwrap();
		let pos = args.iter().position(|a| a == "-r").unwrap();
		assert_eq!(args[pos + 1], "60");
		let pos = args.iter().position(|a| a == "-b:v").unwrap();
		assert_eq!(args[pos + 1], "20000k");
	}

	#[test]
	fn reads_tee_slave_failures_back_to_the_right_destination() {
		let line = "[tee @ 0x1] Slave muxer #1 failed: Connection refused, continuing with 1/2 slaves.";
		let (index, reason) = parse_target_failure(line, false).unwrap();
		assert_eq!(index, 1);
		assert!(reason.contains("Connection refused"), "{reason}");
	}

	#[test]
	fn blames_target_zero_when_there_is_no_tee() {
		// With one destination ffmpeg writes flv directly, so nothing numbers
		// the failure — it can only be the single target.
		let line = "[rtmp @ 0x1] Cannot open connection tcp://host:1935";
		assert_eq!(parse_target_failure(line, true).unwrap().0, 0);
		// The same line with several targets is the tee's job to attribute.
		assert!(parse_target_failure(line, false).is_none());
	}

	#[test]
	fn ordinary_log_lines_are_not_failures() {
		assert!(parse_target_failure("frame= 120 fps=30", false).is_none());
		assert!(parse_target_failure("[libx264] using cpu capabilities", true).is_none());
	}

	#[test]
	fn redact_hides_stream_keys() {
		let args = build_args(&cfg(&[
			"rtmp://localhost:1935/live/supersecret",
			"rtmps://a.rtmp.youtube.com/live2/abcd-efgh",
		]))
		.unwrap();
		let shown = redact(&args).join(" ");
		assert!(!shown.contains("supersecret"));
		assert!(!shown.contains("abcd-efgh"));
		assert!(shown.contains("a.rtmp.youtube.com/live2/***"));
	}

	#[test]
	fn scene_change_threshold_is_x264_only() {
		// VideoToolbox has no such option and ffmpeg warns loudly about it.
		let hw = build_args(&cfg(&["rtmp://h/live/k"])).unwrap();
		assert!(!hw.contains(&"-sc_threshold".to_string()));
		let mut c = cfg(&["rtmp://h/live/k"]);
		c.encoder = "software".into();
		assert!(build_args(&c).unwrap().contains(&"-sc_threshold".to_string()));
	}

	#[test]
	fn software_encoder_switches_codec() {
		let mut c = cfg(&["rtmp://h/live/k"]);
		c.encoder = "software".into();
		let args = build_args(&c).unwrap();
		assert!(args.contains(&"libx264".to_string()));
		assert!(!args.contains(&"h264_videotoolbox".to_string()));
	}

	#[test]
	fn unknown_container_is_refused() {
		let mut c = cfg(&["rtmp://h/live/k"]);
		c.container = "mkv".into();
		assert!(build_args(&c).is_err());
	}
}
