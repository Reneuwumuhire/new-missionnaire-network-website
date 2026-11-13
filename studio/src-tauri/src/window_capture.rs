//! Native macOS window capture. WebKit's getDisplayMedia path can stall
//! the desktop while sharing a browser playing live video. ScreenCaptureKit
//! captures one selected window directly and can omit the pointer before it
//! becomes part of the frame, as OBS does.

use serde::Serialize;
use tauri::ipc::{Channel, InvokeResponseBody};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureInfo {
	pub width: u32,
	pub height: u32,
	pub has_audio: bool,
}

#[cfg(target_os = "macos")]
mod platform {
	use super::{CaptureInfo, Channel, InvokeResponseBody};
	use crate::appaudio::{configure_audio, send_pcm};
	use core_graphics::window::{create_window_list, kCGNullWindowID, kCGWindowListOptionAll};
	use image::{codecs::jpeg::JpegEncoder, ColorType};
	use objc2_foundation::NSProcessInfo;
	use screencapturekit::cm::{CMSampleBuffer, CMSampleBufferExt};
	use screencapturekit::shareable_content::SCShareableContent;
	use screencapturekit::stream::{
		configuration::SCStreamConfiguration, content_filter::SCContentFilter,
		delegate_trait::ErrorHandler,
		output_trait::SCStreamOutputTrait, output_type::SCStreamOutputType, SCStream,
	};
	use std::collections::HashMap;
	use std::sync::{
		atomic::{AtomicBool, Ordering}, Arc, Condvar, Mutex,
	};
	use std::time::{Duration, Instant};

	const WINDOW_CHECK_INTERVAL: Duration = Duration::from_millis(500);
	// An empty packet means there is no new frame. A one-byte packet means the
	// capture ended. Image packets always contain an eight-byte sequence prefix.
	const CAPTURE_ENDED: u8 = 1;

	struct RawFrame {
		width: u32,
		height: u32,
		rgb: Vec<u8>,
	}

	#[derive(Default)]
	struct LatestFrame {
		sequence: u64,
		jpeg: Vec<u8>,
	}

	struct Handler {
		frames: Arc<(Mutex<Option<RawFrame>>, Condvar)>,
	}

	impl SCStreamOutputTrait for Handler {
		fn did_output_sample_buffer(&self, sample: CMSampleBuffer, of_type: SCStreamOutputType) {
			if of_type != SCStreamOutputType::Screen { return; }
			let Some(pixel) = sample.image_buffer() else { return };
			// SCStreamConfiguration::new pins BGRA. Never interpret a different
			// format as BGRA if the OS changes the delivered format.
			if pixel.pixel_format() != u32::from_be_bytes(*b"BGRA") { return; }
			let (width, height) = (pixel.width(), pixel.height());
			if width == 0 || height == 0 || width > 1920 || height > 1080 { return; }
			let stride = pixel.bytes_per_row();
			if stride < width * 4 { return; }
			let Ok(guard) = pixel.lock_read_only() else { return };
			let ptr = guard.base_address();
			if ptr.is_null() { return; }
			let Some(length) = stride.checked_mul(height) else { return };
			let bgra = unsafe { std::slice::from_raw_parts(ptr, length) };
			let mut rgb = Vec::with_capacity(width * height * 3);
			for row in bgra.chunks_exact(stride).take(height) {
				for pixel in row[..width * 4].chunks_exact(4) {
					rgb.extend_from_slice(&[pixel[2], pixel[1], pixel[0]]);
				}
			}
			// Keep the newest frame while encoding is busy; an older queued frame
			// would make the live picture fall behind the browser.
			let (slot, ready) = &*self.frames;
			if let Ok(mut slot) = slot.lock() {
				*slot = Some(RawFrame { width: width as u32, height: height as u32, rgb });
				ready.notify_one();
			}
		}
	}

	struct Active {
		stream: SCStream,
		latest: Arc<Mutex<LatestFrame>>,
		frames: Arc<(Mutex<Option<RawFrame>>, Condvar)>,
		running: Arc<AtomicBool>,
		width: u32,
		height: u32,
		fps: u32,
		has_audio: bool,
		window_id: u32,
		next_window_check: Instant,
	}

	fn end_capture(running: &AtomicBool, frames: &(Mutex<Option<RawFrame>>, Condvar)) {
		// Use the worker's mutex so the notification cannot race its wait.
		let _slot = frames.0.lock();
		running.store(false, Ordering::Relaxed);
		frames.1.notify_all();
	}

	pub struct Capture(Mutex<HashMap<String, Active>>);

	// SCStream is an Objective-C object whose callbacks run on its own queue.
	// Access to the stream map is serialized, as for the existing audio capture.
	unsafe impl Send for Capture {}
	unsafe impl Sync for Capture {}

	impl Default for Capture {
		fn default() -> Self { Self(Mutex::new(HashMap::new())) }
	}

	fn configuration(
		width: u32, height: u32, fps: u32, hide_cursor: bool, has_audio: bool,
	) -> SCStreamConfiguration {
		let mut config = SCStreamConfiguration::new();
		config.set_width(width).set_height(height).set_fps(fps)
			.set_queue_depth(3).set_shows_cursor(!hide_cursor).set_scales_to_fit(true);
		if has_audio {
			configure_audio(&mut config);
		}
		config
	}

	impl Capture {
		pub fn start(&self, id: &str, window_id: u32, max_width: u32, max_height: u32,
			fps: u32, hide_cursor: bool, audio: Channel<InvokeResponseBody>) -> Result<CaptureInfo, String> {
			self.stop(Some(id));
			let content = SCShareableContent::create()
				.with_on_screen_windows_only(false)
				.get()
				.map_err(|e| format!("Windows unavailable: {e:?}"))?;
			let window = content.windows().into_iter()
				.find(|window| window.window_id() == window_id)
				.ok_or("The selected window is no longer open")?;
			let frame = window.frame();
			let source_width = frame.size.width.max(1.0);
			let source_height = frame.size.height.max(1.0);
			let scale = (max_width.clamp(1, 1920) as f64 / source_width)
				.min(max_height.clamp(1, 1080) as f64 / source_height).min(1.0);
			let width = (source_width * scale).round().max(2.0) as u32;
			let height = (source_height * scale).round().max(2.0) as u32;
			let filter = SCContentFilter::create().with_window(&window).build();
			let fps = fps.clamp(1, 30);
			let has_audio = NSProcessInfo::processInfo().operatingSystemVersion().majorVersion >= 13;
			let config = configuration(width, height, fps, hide_cursor, has_audio);
			let frames = Arc::new((Mutex::new(None::<RawFrame>), Condvar::new()));
			let latest = Arc::new(Mutex::new(LatestFrame::default()));
			let running = Arc::new(AtomicBool::new(true));
			let ended_running = Arc::clone(&running);
			let ended_frames = Arc::clone(&frames);
			let delegate = ErrorHandler::new(move |error| {
				eprintln!("Window capture stopped: {error}");
				end_capture(&ended_running, &ended_frames);
			});
			let mut stream = SCStream::new_with_delegate(&filter, &config, delegate);
			stream.add_output_handler(Handler { frames: Arc::clone(&frames) }, SCStreamOutputType::Screen);
			if has_audio {
				let audio_running = Arc::clone(&running);
				stream.add_output_handler(move |sample, _| {
					if audio_running.load(Ordering::Relaxed) {
						send_pcm(sample, &audio);
					}
				}, SCStreamOutputType::Audio).ok_or("Window audio output could not be registered")?;
			}
			stream.start_capture()
				.map_err(|e| format!("Window capture could not start: {e:?}"))?;
			let worker_latest = Arc::clone(&latest);
			let worker_running = Arc::clone(&running);
			let worker_frames = Arc::clone(&frames);
			std::thread::spawn(move || {
				loop {
					let (slot, ready) = &*worker_frames;
					let Ok(guard) = slot.lock() else { break };
					let Ok(mut guard) = ready.wait_while(guard, |frame| {
						frame.is_none() && worker_running.load(Ordering::Relaxed)
					}) else { break };
					if !worker_running.load(Ordering::Relaxed) { break; }
					let Some(frame) = guard.take() else { continue };
					drop(guard);
					let mut jpeg = Vec::new();
					if JpegEncoder::new_with_quality(&mut jpeg, 72)
						.encode(&frame.rgb, frame.width, frame.height, ColorType::Rgb8.into()).is_ok() {
						if let Ok(mut latest) = worker_latest.lock() {
							latest.sequence = latest.sequence.wrapping_add(1);
							latest.jpeg = jpeg;
						}
					}
				}
			});
			let mut streams = match self.0.lock() {
				Ok(streams) => streams,
				Err(err) => {
					end_capture(&running, &frames);
					let _ = stream.stop_capture();
					return Err(err.to_string());
				}
			};
			streams.insert(id.to_owned(), Active {
				stream, latest, frames, running, width, height, fps, has_audio, window_id,
				next_window_check: Instant::now() + WINDOW_CHECK_INTERVAL,
			});
			Ok(CaptureInfo { width, height, has_audio })
		}

		pub fn frame(&self, id: &str, last_sequence: u64) -> Vec<u8> {
			let Ok(mut streams) = self.0.lock() else { return vec![CAPTURE_ENDED] };
			let Some(active) = streams.get_mut(id) else { return vec![CAPTURE_ENDED] };
			let now = Instant::now();
			if active.running.load(Ordering::Relaxed) && now >= active.next_window_check {
				active.next_window_check = now + WINDOW_CHECK_INTERVAL;
				// An app can keep playing after its window closes. Check the actual
				// window ID, including offscreen and minimized windows.
				if let Some(windows) = create_window_list(kCGWindowListOptionAll, kCGNullWindowID) {
					if !windows.iter().any(|id| *id == active.window_id) {
						end_capture(&active.running, &active.frames);
					}
				}
			}
			if !active.running.load(Ordering::Relaxed) { return vec![CAPTURE_ENDED]; }
			let latest = Arc::clone(&active.latest);
			drop(streams);
			let Ok(frame) = latest.lock() else { return Vec::new() };
			if frame.sequence <= last_sequence || frame.jpeg.is_empty() { return Vec::new(); }
			let mut packet = Vec::with_capacity(8 + frame.jpeg.len());
			packet.extend_from_slice(&frame.sequence.to_le_bytes());
			packet.extend_from_slice(&frame.jpeg);
			packet
		}

		pub fn set_cursor(&self, id: &str, hide_cursor: bool) -> Result<(), String> {
			let streams = self.0.lock().map_err(|e| e.to_string())?;
			let active = streams.get(id).ok_or("Window capture has ended")?;
			active.stream.update_configuration(
				&configuration(active.width, active.height, active.fps, hide_cursor, active.has_audio)
			).map_err(|e| format!("Cursor setting could not be applied: {e:?}"))
		}

		pub fn stop(&self, id: Option<&str>) {
			if let Ok(mut streams) = self.0.lock() {
				let removed: Vec<_> = match id {
					Some(id) => streams.remove(id).into_iter().collect(),
					None => streams.drain().map(|(_, active)| active).collect(),
				};
				drop(streams);
				for active in removed {
					end_capture(&active.running, &active.frames);
					let _ = active.stream.stop_capture();
				}
			}
		}
	}
}

#[cfg(not(target_os = "macos"))]
mod platform {
	use super::{CaptureInfo, Channel, InvokeResponseBody};
	#[derive(Default)]
	pub struct Capture;
	impl Capture {
		pub fn start(&self, _: &str, _: u32, _: u32, _: u32, _: u32, _: bool, _: Channel<InvokeResponseBody>) -> Result<CaptureInfo, String> {
			Err("Native window capture is available on macOS only".into())
		}
		pub fn frame(&self, _: &str, _: u64) -> Vec<u8> { Vec::new() }
		pub fn set_cursor(&self, _: &str, _: bool) -> Result<(), String> { Ok(()) }
		pub fn stop(&self, _: Option<&str>) {}
	}
}

pub use platform::Capture;
