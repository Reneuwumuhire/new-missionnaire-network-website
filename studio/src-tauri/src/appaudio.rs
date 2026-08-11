//! Per-application audio capture.
//!
//! The browser engine cannot do this: WebKit ignores audio on getDisplayMedia
//! entirely. So the sound of a shared window is captured natively here and
//! posted into the webview, where it joins the WebAudio graph as an ordinary
//! strip — same fader, same meter, same monitoring, and it reaches the encoder
//! through the mix that was already there. Nothing downstream had to change.
//!
//! macOS uses ScreenCaptureKit (13+). Windows and Linux compile to a stub that
//! says so, so the UI is identical everywhere and only the answer differs.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct AudioApp {
	pub id: String,
	pub name: String,
}

/// ScreenCaptureKit delivers 32-bit float planar — one buffer per channel. The
/// webview's worklet wants one interleaved stereo block, so it can copy
/// straight out without knowing the layout.
///
/// A mono source is doubled onto both sides rather than left silent on the
/// right, and a plane shorter than the first is not read past its end.
fn interleave_stereo(planes: &[&[u8]]) -> Vec<u8> {
	const SAMPLE: usize = 4;
	let Some(first) = planes.first() else { return Vec::new() };
	let frames = first.len() / SAMPLE;
	let mut out = Vec::with_capacity(frames * 2 * SAMPLE);
	for frame in 0..frames {
		for channel in 0..2 {
			let plane = planes.get(channel).copied().unwrap_or(first);
			let at = frame * SAMPLE;
			if at + SAMPLE <= plane.len() {
				out.extend_from_slice(&plane[at..at + SAMPLE]);
			} else {
				out.extend_from_slice(&[0; SAMPLE]);
			}
		}
	}
	out
}

#[cfg(test)]
mod tests {
	use super::interleave_stereo;

	fn f32s(values: &[f32]) -> Vec<u8> {
		values.iter().flat_map(|v| v.to_ne_bytes()).collect()
	}

	fn read(bytes: &[u8]) -> Vec<f32> {
		bytes
			.chunks_exact(4)
			.map(|c| f32::from_ne_bytes([c[0], c[1], c[2], c[3]]))
			.collect()
	}

	#[test]
	fn weaves_two_planes_into_one_stereo_block() {
		let left = f32s(&[0.1, 0.2]);
		let right = f32s(&[-0.1, -0.2]);
		let out = read(&interleave_stereo(&[&left, &right]));
		assert_eq!(out, vec![0.1, -0.1, 0.2, -0.2]);
	}

	#[test]
	fn doubles_a_mono_source_onto_both_sides() {
		// Otherwise a mono app would only ever be heard on the left.
		let mono = f32s(&[0.5, 0.25]);
		let out = read(&interleave_stereo(&[&mono]));
		assert_eq!(out, vec![0.5, 0.5, 0.25, 0.25]);
	}

	#[test]
	fn pads_rather_than_reading_past_a_short_plane() {
		let left = f32s(&[1.0, 1.0]);
		let right = f32s(&[-1.0]);
		let out = read(&interleave_stereo(&[&left, &right]));
		assert_eq!(out, vec![1.0, -1.0, 1.0, 0.0]);
	}

	#[test]
	fn no_planes_is_no_audio() {
		assert!(interleave_stereo(&[]).is_empty());
	}
}

#[cfg(target_os = "macos")]
mod platform {
	use super::AudioApp;
	use std::sync::Mutex;

	use screencapturekit::cm::{CMSampleBuffer, CMSampleBufferExt};
	use screencapturekit::shareable_content::SCShareableContent;
	use screencapturekit::stream::{
		configuration::SCStreamConfiguration, content_filter::SCContentFilter,
		output_trait::SCStreamOutputTrait, output_type::SCStreamOutputType, SCStream,
	};
	use tauri::ipc::{Channel, InvokeResponseBody};

	/// SCK hands us 32-bit float, one buffer per channel. The webview wants a
	/// single interleaved stereo block, which is also what an AudioWorklet can
	/// copy straight into its ring buffer.
	struct Handler {
		channel: Channel<InvokeResponseBody>,
	}

	impl SCStreamOutputTrait for Handler {
		fn did_output_sample_buffer(&self, sample: CMSampleBuffer, of_type: SCStreamOutputType) {
			if of_type != SCStreamOutputType::Audio {
				return;
			}
			let Some(list) = sample.audio_buffer_list() else { return };
			let planes: Vec<&[u8]> = list.iter().map(|buffer| buffer.data()).collect();
			let interleaved = super::interleave_stereo(&planes);
			if interleaved.is_empty() {
				return;
			}
			// A dead webview must not kill the capture thread; the next start
			// replaces the channel anyway.
			let _ = self.channel.send(InvokeResponseBody::Raw(interleaved));
		}
	}

	// SCStream is an ObjC object driven from its own dispatch queue. Holding it
	// behind a mutex is only so stop() can find it again.
	pub struct Capture(Mutex<Option<SCStream>>);

	// SAFETY: the stream is only created, kept, and stopped; every callback runs
	// on SCK's queue and touches nothing in here.
	unsafe impl Send for Capture {}
	unsafe impl Sync for Capture {}

	impl Default for Capture {
		fn default() -> Self {
			Self(Mutex::new(None))
		}
	}

	pub fn list() -> Result<Vec<AudioApp>, String> {
		let content = SCShareableContent::get().map_err(|e| {
			format!("Partage d'écran non autorisé ou indisponible: {e:?}")
		})?;
		let mut apps: Vec<AudioApp> = content
			.applications()
			.into_iter()
			.filter_map(|app| {
				let id = app.bundle_identifier();
				let name = app.application_name();
				// Unnamed helpers and our own process are noise in a picker.
				if id.is_empty() || name.is_empty() || id == "network.missionnaire.studio" {
					return None;
				}
				Some(AudioApp { id, name })
			})
			.collect();
		apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
		apps.dedup_by(|a, b| a.id == b.id);
		Ok(apps)
	}

	impl Capture {
		pub fn start(
			&self,
			bundle_id: &str,
			channel: Channel<InvokeResponseBody>,
		) -> Result<(), String> {
			self.stop();

			let content = SCShareableContent::get()
				.map_err(|e| format!("Contenu partageable indisponible: {e:?}"))?;
			let app = content
				.applications()
				.into_iter()
				.find(|a| a.bundle_identifier() == bundle_id)
				.ok_or("Application introuvable — a-t-elle été fermée ?")?;
			let display = content
				.displays()
				.into_iter()
				.next()
				.ok_or("Aucun écran disponible")?;

			// Audio only. SCK still wants a video configuration, so it gets the
			// smallest one that is legal rather than a second full-size capture
			// running for nothing.
			let filter = SCContentFilter::create()
				.with_display(&display)
				.with_including_applications(&[&app], &[])
				.build();

			let mut config = SCStreamConfiguration::new();
			config
				.set_captures_audio(true)
				.set_sample_rate(48_000)
				.set_channel_count(2)
				// Without this the studio's own monitoring would be captured and
				// fed back into the mix.
				.set_excludes_current_process_audio(true)
				.set_width(2)
				.set_height(2);

			let mut stream = SCStream::new(&filter, &config);
			stream.add_output_handler(Handler { channel }, SCStreamOutputType::Audio);
			stream
				.start_capture()
				.map_err(|e| format!("Capture audio impossible: {e:?}"))?;

			*self.0.lock().map_err(|e| e.to_string())? = Some(stream);
			Ok(())
		}

		pub fn stop(&self) {
			if let Ok(mut guard) = self.0.lock() {
				if let Some(stream) = guard.take() {
					let _ = stream.stop_capture();
				}
			}
		}
	}
}

#[cfg(not(target_os = "macos"))]
mod platform {
	use super::AudioApp;
	use tauri::ipc::{Channel, InvokeResponseBody};

	#[derive(Default)]
	pub struct Capture;

	/// Windows can do this through WASAPI process loopback and Linux through
	/// PipeWire; neither is written yet. Returning an empty list rather than an
	/// error lets the UI show "not available on this system" in its own words.
	pub fn list() -> Result<Vec<AudioApp>, String> {
		Ok(Vec::new())
	}

	impl Capture {
		pub fn start(&self, _bundle_id: &str, _channel: Channel<InvokeResponseBody>) -> Result<(), String> {
			Err("La capture audio par application n'est pas encore disponible sur ce système.".into())
		}

		pub fn stop(&self) {}
	}
}

pub use platform::{list, Capture};
