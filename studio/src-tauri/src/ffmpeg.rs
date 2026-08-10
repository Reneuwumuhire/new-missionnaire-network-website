//! The only thing the Rust side owns: one ffmpeg process that takes the
//! webview's composited MediaRecorder output on stdin and pushes it to every
//! enabled RTMP destination.
//!
//! Everything visual (scenes, layers, lyrics) happens on a canvas in the
//! webview — switching scenes is just drawing something else, so the encoder
//! and the RTMP connections never restart mid-broadcast.

use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{sync_channel, SyncSender, TrySendError};
use std::sync::{Arc, Mutex};
use std::thread;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

/// Chunks buffered between the webview and ffmpeg's stdin. MediaRecorder emits
/// one per timeslice (~250 ms), so this is ~30 s of slack — far more than a
/// healthy encoder needs, and when it does fill up the network is the problem,
/// not the buffer.
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
	/// Chunks the queue had to discard because ffmpeg could not keep up.
	pub discarded_chunks: u64,
}

struct Running {
	tx: Option<SyncSender<Vec<u8>>>,
	child: Arc<Mutex<Child>>,
	discarded: Arc<AtomicU64>,
}

#[derive(Default)]
pub struct Encoder(Mutex<Option<Running>>);

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
	if cfg.targets.is_empty() {
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
		push!("-profile:v", "main", "-sc_threshold", "0");
	} else {
		// `-allow_sw 1` falls back inside VideoToolbox rather than dying if the
		// GPU session cannot be created (happens under screen sharing).
		push!("-c:v", "h264_videotoolbox", "-realtime", "1", "-allow_sw", "1");
		push!("-profile:v", "main");
	}
	push!("-pix_fmt", "yuv420p");
	push!("-b:v", format!("{vk}k"), "-maxrate", format!("{vk}k"), "-bufsize", format!("{}k", vk * 2));
	// 2-second keyframe interval: what YouTube asks for, and what keeps the
	// HLS packager on the Fly box cutting clean segments.
	push!("-r", fps, "-g", fps * 2, "-keyint_min", fps);

	push!("-c:a", "aac", "-b:a", format!("{ak}k"), "-ar", "48000", "-ac", "2");
	push!("-nostats", "-progress", "pipe:1");

	if cfg.targets.len() == 1 {
		push!("-f", "flv", cfg.targets[0].url);
	} else {
		// tee fans one encode out to every destination. `onfail=ignore` is the
		// point: YouTube rejecting the key must not take the church's own
		// stream down with it.
		push!("-flags", "+global_header", "-f", "tee");
		push!(cfg
			.targets
			.iter()
			.map(|t| format!("[f=flv:onfail=ignore]{}", t.url))
			.collect::<Vec<_>>()
			.join("|"));
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
		self.0.lock().map(|g| g.is_some()).unwrap_or(false)
	}

	pub fn start(&self, app: &AppHandle, cfg: StreamConfig) -> Result<Vec<String>, String> {
		let mut guard = self.0.lock().map_err(|e| e.to_string())?;
		if guard.is_some() {
			return Err("Une diffusion est déjà en cours".into());
		}
		let bin = resolve_ffmpeg()?;
		let args = build_args(&cfg)?;

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
		let discarded = Arc::new(AtomicU64::new(0));

		// Writer thread. Owning stdin here is what keeps `push_chunk` from ever
		// blocking the UI: a stalled upload backs the queue up and we drop
		// chunks, we never freeze the webview.
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
		let discarded_stats = discarded.clone();
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
					"speed" => {
						stats.speed = value.trim_end_matches('x').parse().unwrap_or(stats.speed)
					}
					"progress" => {
						stats.discarded_chunks = discarded_stats.load(Ordering::Relaxed);
						let _ = app_stats.emit("stream://stats", stats.clone());
					}
					_ => {}
				}
			}
		});

		// stderr reader: surfaces ffmpeg's own words, and the exit reason.
		let app_log = app.clone();
		let child_handle = Arc::new(Mutex::new(child));
		let child_wait = child_handle.clone();
		thread::spawn(move || {
			let mut tail: VecDeque<String> = VecDeque::with_capacity(LOG_TAIL);
			for line in BufReader::new(stderr).lines().map_while(Result::ok) {
				if tail.len() == LOG_TAIL {
					tail.pop_front();
				}
				tail.push_back(line.clone());
				let _ = app_log.emit("stream://log", line);
			}
			// stderr closed → the process is on its way out. Reap it and tell
			// the UI, so a dead encoder can never look "live".
			let status = child_wait.lock().ok().and_then(|mut c| c.wait().ok());
			let code = status.and_then(|s| s.code()).unwrap_or(-1);
			let _ = app_log.emit(
				"stream://exited",
				serde_json::json!({
					"code": code,
					"log": tail.iter().cloned().collect::<Vec<_>>(),
				}),
			);
		});

		*guard = Some(Running {
			tx: Some(tx),
			child: child_handle,
			discarded,
		});
		Ok(redact(&args))
	}

	pub fn push(&self, bytes: &[u8]) -> Result<(), String> {
		let guard = self.0.lock().map_err(|e| e.to_string())?;
		// A chunk arriving after stop() is normal — MediaRecorder flushes one
		// last blob on its way down. Silently ignore it.
		let Some(run) = guard.as_ref() else { return Ok(()) };
		let Some(tx) = run.tx.as_ref() else { return Ok(()) };
		match tx.try_send(bytes.to_vec()) {
			Ok(()) => Ok(()),
			Err(TrySendError::Full(_)) => {
				run.discarded.fetch_add(1, Ordering::Relaxed);
				Ok(())
			}
			Err(TrySendError::Disconnected(_)) => Err("Le flux ffmpeg s'est arrêté".into()),
		}
	}

	pub fn stop(&self) -> Result<(), String> {
		let mut guard = self.0.lock().map_err(|e| e.to_string())?;
		let Some(mut run) = guard.take() else { return Ok(()) };
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
		Ok(())
	}
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
		}
	}

	#[test]
	fn single_target_uses_flv_not_tee() {
		let args = build_args(&cfg(&["rtmp://localhost:1935/live/obs"])).unwrap();
		assert!(!args.iter().any(|a| a == "tee"));
		assert_eq!(args.last().unwrap(), "rtmp://localhost:1935/live/obs");
		assert!(args.windows(2).any(|w| w[0] == "-f" && w[1] == "flv"));
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
