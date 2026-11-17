//! Relay the encoder's H.264/AAC packets to independent RTMP outputs.
use std::io::{BufRead, BufReader, Error, ErrorKind, Read, Write};
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering::Relaxed};
use std::sync::mpsc::{sync_channel, Receiver, SyncSender, TrySendError};
use std::sync::{Arc, Mutex, Weak};
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};

use crate::diagnostics::{redact_stream_urls, Logs};
use crate::ffmpeg::ffmpeg_command;

const TICK: Duration = Duration::from_millis(100);
const STALL: Duration = Duration::from_secs(6);
const QUEUE_PACKETS: usize = 240;
const QUEUE_BYTES: u64 = 8 * 1024 * 1024;
const FLV_HEADER: [u8; 13] = *b"FLV\x01\x00\x00\x00\x00\x09\x00\x00\x00\x00";

type Packet = Arc<Vec<u8>>;

struct Attempt {
	tx: SyncSender<Packet>,
	waiting_for_keyframe: bool,
	overflowed: Arc<AtomicBool>,
	queued_bytes: Arc<AtomicU64>,
}

#[derive(Default)]
struct Subscription {
	attempt: Mutex<Option<Attempt>>,
	stopped: AtomicBool,
}

pub struct Publisher(Arc<Subscription>);

impl Drop for Publisher {
	fn drop(&mut self) {
		self.0.stopped.store(true, Relaxed);
	}
}

#[derive(Default)]
pub struct PacketHub {
	subscribers: Mutex<Vec<Weak<Subscription>>>,
	closed: AtomicBool,
	encoded_bytes: AtomicU64,
}

impl PacketHub {
	pub fn start(
		self: &Arc<Self>, app: AppHandle, bin: &Path, url: String,
		group: String, run_id: u64, index: usize,
	) -> Publisher {
		let input = Arc::new(Subscription::default());
		self.subscribers.lock().unwrap().push(Arc::downgrade(&input));
		let args = publish_args(&url);
		let bin = bin.to_owned();
		let hub = self.clone();
		let worker = input.clone();
		thread::spawn(move || {
			let stopped = || worker.stopped.load(Relaxed) || hub.closed.load(Relaxed);
			let status = |state: &str, reason: &str| {
				if !stopped() {
					let _ = app.emit("stream://target", serde_json::json!({
						"group": group, "runId": run_id, "index": index, "state": state,
						"reason": reason
					}));
				}
			};
			let mut delay = TICK;
			while !stopped() {
				let overflowed = Arc::new(AtomicBool::new(false));
				let queued_bytes = Arc::new(AtomicU64::new(0));
				let (tx, rx) = sync_channel(QUEUE_PACKETS);
				*worker.attempt.lock().unwrap() = Some(Attempt {
					tx, waiting_for_keyframe: true, overflowed: overflowed.clone(),
					queued_bytes: queued_bytes.clone(),
				});
				let first = loop {
					if stopped() { return; }
					if overflowed.load(Relaxed) { break None; }
					match rx.recv_timeout(TICK) {
						Ok(keyframe) => break Some(keyframe),
						Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
						Err(_) => return,
					}
				};
				if stopped() { return; }
				let mut was_live = false;
				let reason = first.map(|first| {
					publish(&bin, &args, first, rx, queued_bytes, || {
						stopped() || overflowed.load(Relaxed)
					}, || {
						was_live = true;
						status("live", "");
					})
				});
				worker.attempt.lock().unwrap().take();
				if stopped() { break; }
				let reason = if overflowed.load(Relaxed) {
					"RTMP output queue is full".to_owned()
				} else {
					reason.unwrap_or_default()
				};
				let line = format!("{group} RTMP output {}: {reason}", index + 1);
				let _ = app.state::<Logs>().append("ffmpeg", &line);
				let _ = app.emit("stream://log", line);
				// BadName can mean the previous publisher is still disconnecting.
				if authentication_rejected(&reason) {
					status("failed", &reason);
					break;
				}
				status("reconnecting", &reason);
				if was_live { delay = TICK; }
				let until = Instant::now() + delay;
				while Instant::now() < until && !stopped() { thread::sleep(TICK); }
				delay = (delay * 2).min(Duration::from_secs(2));
			}
		});
		Publisher(input)
	}

	pub fn encoded_bytes(&self) -> u64 {
		self.encoded_bytes.load(Relaxed)
	}

	pub fn read(&self, input: impl Read) -> std::io::Result<()> {
		let result = self.relay(input);
		self.closed.store(true, Relaxed);
		result
	}

	fn relay(&self, input: impl Read) -> std::io::Result<()> {
		let mut input = BufReader::new(input);
		let mut header = [0; FLV_HEADER.len()];
		input.read_exact(&mut header)?;
		if header[..4] != FLV_HEADER[..4] || header[5..] != FLV_HEADER[5..] {
			return Err(Error::new(ErrorKind::InvalidData, "Unexpected FFmpeg FLV header"));
		}
		self.encoded_bytes.fetch_add(header.len() as u64, Relaxed);
		let mut video = None;
		let mut audio = None;
		let mut tags = [0; 11];
		while input.read(&mut tags[..1])? != 0 {
			input.read_exact(&mut tags[1..])?;
			let size = u32::from_be_bytes([0, tags[1], tags[2], tags[3]]) as usize;
			let mut bytes = Vec::with_capacity(tags.len() + size + 4);
			bytes.extend_from_slice(&tags);
			bytes.resize(tags.len() + size + 4, 0);
			input.read_exact(&mut bytes[tags.len()..])?;
			self.encoded_bytes.fetch_add(bytes.len() as u64, Relaxed);
			let data = &bytes[tags.len()..tags.len() + size];
			let keyframe = tags[0] == 9 && data.starts_with(&[0x17, 1]);
			let video_header = tags[0] == 9 && data.starts_with(&[0x17, 0]);
			let audio_header = tags[0] == 8 && matches!(data, [format, 0, ..] if format >> 4 == 10);
			let packet = Arc::new(bytes);
			if video_header { video = Some(packet.clone()); }
			if audio_header { audio = Some(packet.clone()); }
			if matches!(tags[0], 8 | 9) {
				self.send(packet, keyframe, &header, video.as_deref(), audio.as_deref());
			}
		}
		Ok(())
	}

	fn send(
		&self, packet: Packet, keyframe: bool, header: &[u8],
		video: Option<&Vec<u8>>, audio: Option<&Vec<u8>>,
	) {
		let mut opening = None;
		self.subscribers.lock().unwrap().retain(|subscriber| {
			let Some(input) = subscriber.upgrade() else { return false };
			if input.stopped.load(Relaxed) { return false; }
			if let Some(attempt) = input.attempt.lock().unwrap().as_mut() {
				let bytes = if attempt.waiting_for_keyframe {
					if !keyframe { return true; }
					let Some(video) = video else { return true; };
					if header[4] & 4 != 0 && audio.is_none() { return true; }
					attempt.waiting_for_keyframe = false;
					opening.get_or_insert_with(|| {
						let mut first = header.to_vec();
						first.extend_from_slice(video);
						if let Some(audio) = audio { first.extend_from_slice(audio); }
						first.extend_from_slice(&packet);
						Arc::new(first)
					}).clone()
				} else {
					packet.clone()
				};
				if !attempt.overflowed.load(Relaxed) {
					let size = bytes.len() as u64;
					let previous = attempt.queued_bytes.fetch_add(size, Relaxed);
					if previous + size > QUEUE_BYTES {
						attempt.queued_bytes.fetch_sub(size, Relaxed);
						attempt.overflowed.store(true, Relaxed);
					} else if let Err(error) = attempt.tx.try_send(bytes) {
						attempt.queued_bytes.fetch_sub(size, Relaxed);
						if matches!(error, TrySendError::Full(_)) {
							attempt.overflowed.store(true, Relaxed);
						}
					}
				}
			}
			true
		});
	}
}

pub fn publish_args(url: &str) -> Vec<String> {
	[
		"-hide_banner", "-loglevel", "warning", "-nostdin", "-nostats",
		"-stats_period", "0.25", "-progress", "pipe:1",
		"-f", "flv", "-analyzeduration", "500000", "-probesize", "65536", "-i", "pipe:0",
		"-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-flush_packets", "1",
		"-rw_timeout", "4000000", "-flvflags", "no_duration_filesize", "-f", "flv", url,
	].into_iter().map(String::from).collect()
}

fn publish(
	bin: &Path, args: &[String], first: Packet, rx: Receiver<Packet>,
	queued_bytes: Arc<AtomicU64>, stopped: impl Fn() -> bool, mut live: impl FnMut(),
) -> String {
	let mut child = match ffmpeg_command(bin).args(args).stdin(Stdio::piped())
		.stdout(Stdio::piped()).stderr(Stdio::piped()).spawn() {
		Ok(child) => child,
		Err(error) => return error.to_string(),
	};
	let mut stdin = child.stdin.take().unwrap();
	let writer = thread::spawn(move || {
		for bytes in std::iter::once(first).chain(rx) {
			queued_bytes.fetch_sub(bytes.len() as u64, Relaxed);
			if stdin.write_all(&bytes).is_err() { break; }
		}
	});
	let progress = Arc::new(AtomicU64::new(0));
	let reader_progress = progress.clone();
	let stdout = child.stdout.take().unwrap();
	let reader = thread::spawn(move || {
		for line in BufReader::new(stdout).lines().map_while(Result::ok) {
			if let Some(time) = line.strip_prefix("out_time_us=").and_then(|value| value.parse::<u64>().ok()) {
				reader_progress.store(time, Relaxed);
			}
		}
	});
	let stderr = child.stderr.take().unwrap();
	let log = thread::spawn(move || {
		let mut last = String::new();
		for line in BufReader::new(stderr).lines().map_while(Result::ok) {
			if authentication_rejected(&last) {
				continue;
			}
			last = line;
		}
		redact_stream_urls(&last)
	});
	let mut last_time = 0;
	let mut reported_live_at: Option<Instant> = None;
	let mut advanced_at = Instant::now();
	let mut reason = "RTMP connection closed";
	while !stopped() {
		if !matches!(child.try_wait(), Ok(None)) { break; }
		let time = progress.load(Relaxed);
		if time > last_time {
			// Resend occasionally so a late IPC listener still learns the current state.
			if reported_live_at.map_or(true, |at| at.elapsed() >= Duration::from_secs(2)) {
				live();
				reported_live_at = Some(Instant::now());
			}
			last_time = time;
			advanced_at = Instant::now();
		}
		if advanced_at.elapsed() >= STALL {
			reason = "RTMP output stopped advancing";
			break;
		}
		thread::sleep(TICK);
	}
	let _ = child.kill();
	let _ = child.wait();
	let _ = reader.join();
	// The caller drops the attempt after this returns, which releases the writer
	// even when it was waiting for the next packet.
	drop(writer);
	match log.join() {
		Ok(line) if !line.is_empty() => line,
		_ => reason.to_owned(),
	}
}

fn authentication_rejected(line: &str) -> bool {
	line.contains("Server returned 401") || line.contains("Server returned 403")
}

#[cfg(test)]
mod tests {
	use super::*;

	fn subscribe(hub: &PacketHub, capacity: usize) -> (Arc<Subscription>, Receiver<Packet>, Arc<AtomicBool>) {
		let input = Arc::new(Subscription::default());
		let overflowed = Arc::new(AtomicBool::new(false));
		let (tx, rx) = sync_channel(capacity);
		*input.attempt.lock().unwrap() = Some(Attempt {
			tx, waiting_for_keyframe: true, overflowed: overflowed.clone(),
			queued_bytes: Arc::new(AtomicU64::new(0)),
		});
		hub.subscribers.lock().unwrap().push(Arc::downgrade(&input));
		(input, rx, overflowed)
	}

	fn tag(kind: u8, data: &[u8]) -> Vec<u8> {
		let mut bytes = vec![kind, 0, 0, data.len() as u8, 0, 0, 0, 0, 0, 0, 0];
		bytes.extend_from_slice(data);
		bytes.extend_from_slice(&((11 + data.len()) as u32).to_be_bytes());
		bytes
	}

	#[test]
	fn retries_when_the_previous_publisher_still_holds_the_stream_name() {
		assert!(!authentication_rejected("NetStream.Publish.BadName"));
		assert!(!authentication_rejected("Server returned 429 Too Many Requests"));
		assert!(authentication_rejected("Server returned 403 Forbidden"));
	}

	#[test]
	fn waits_for_keyframe_and_bootstraps_each_output() {
		let hub = PacketHub::default();
		let (_subscriber, rx, _) = subscribe(&hub, 8);
		let video = tag(9, &[0x17, 0, 11]);
		let audio = tag(8, &[0xaf, 0, 22]);
		let delta = tag(9, &[0x27, 1, 33]);
		let key = tag(9, &[0x17, 1, 44]);
		let mut header = FLV_HEADER;
		header[4] = 5;
		let mut media = header.to_vec();
		for packet in [&video, &audio, &delta, &key, &delta] {
			media.extend_from_slice(packet);
		}
		hub.read(media.as_slice()).unwrap();
		let expected = [header.as_slice(), &video, &audio, &key].concat();
		assert_eq!(*rx.try_recv().unwrap(), expected);
		assert_eq!(*rx.try_recv().unwrap(), delta);
		assert!(rx.try_recv().is_err());
	}

	#[test]
	fn an_overflowed_output_leaves_other_outputs_and_can_rejoin() {
		let hub = PacketHub::default();
		let (slow, _slow_rx, overflowed) = subscribe(&hub, 1);
		let (_healthy, healthy_rx, healthy_overflowed) = subscribe(&hub, 8);
		let video = tag(9, &[0x17, 0, 11]);
		let key = Arc::new(tag(9, &[0x17, 1, 22]));
		let delta = Arc::new(tag(9, &[0x27, 1, 33]));
		hub.send(key.clone(), true, &FLV_HEADER, Some(&video), None);
		hub.send(delta.clone(), false, &FLV_HEADER, Some(&video), None);
		assert!(overflowed.load(Relaxed));
		assert!(!healthy_overflowed.load(Relaxed));
		drop(slow);
		let (_reconnecting, recovered_rx, _) = subscribe(&hub, 8);
		hub.send(delta, false, &FLV_HEADER, Some(&video), None);
		assert!(recovered_rx.try_recv().is_err());
		hub.send(key.clone(), true, &FLV_HEADER, Some(&video), None);
		assert_eq!(*recovered_rx.try_recv().unwrap(), [FLV_HEADER.as_slice(), &video, &key].concat());
		assert_eq!(healthy_rx.try_iter().count(), 4);
	}

	#[test]
	#[ignore = "requires FFmpeg"]
	fn bootstrapped_packets_remux_and_decode_with_audio() {
		let ffmpeg = crate::ffmpeg::resolve_ffmpeg().unwrap();
		let source = ffmpeg_command(&ffmpeg).args([
			"-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30",
			"-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
			"-t", "1", "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency",
			"-c:a", "aac", "-output_ts_offset", "30", "-f", "flv", "pipe:1",
		]).output().unwrap();
		assert!(source.status.success(), "{}", String::from_utf8_lossy(&source.stderr));

		let hub = PacketHub::default();
		let (_subscriber, rx, overflowed) = subscribe(&hub, QUEUE_PACKETS);
		hub.read(source.stdout.as_slice()).unwrap();
		assert!(!overflowed.load(Relaxed));
		// The publishing command reserves stdout for progress. Keep the decoded
		// media separate by using stderr for progress during the fixture.
		let mut args = publish_args("pipe:1");
		let progress_pipe = args.iter().position(|arg| arg == "-progress").unwrap() + 1;
		args[progress_pipe] = "pipe:2".into();
		let mut publisher = ffmpeg_command(&ffmpeg).args(args)
			.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
		let mut stdin = publisher.stdin.take().unwrap();
		let packets: Vec<_> = rx.try_iter().collect();
		assert!(!packets.is_empty());
		let input = thread::spawn(move || {
			for packet in packets { stdin.write_all(&packet).unwrap(); }
		});
		let published = publisher.wait_with_output().unwrap();
		input.join().unwrap();
		assert!(published.status.success(), "{}", String::from_utf8_lossy(&published.stderr));
		assert!(published.stdout.starts_with(b"FLV"));

		let mut decoder = ffmpeg_command(ffmpeg).args([
			"-v", "error", "-xerror", "-f", "flv", "-i", "pipe:0",
			"-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-",
		]).stdin(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
		decoder.stdin.take().unwrap().write_all(&published.stdout).unwrap();
		let decoded = decoder.wait_with_output().unwrap();
		assert!(decoded.status.success(), "{}", String::from_utf8_lossy(&decoded.stderr));
	}
}
