//! Compact timing features for matching a captured sermon to its reference audio.
//! ffmpeg decodes incrementally, so a two-hour MP3 never becomes a two-hour PCM
//! allocation. The webview receives only three numbers per 100 ms frame.

use serde::Serialize;
use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};

const SAMPLE_RATE: usize = 8_000;
pub const FRAME_MS: u32 = 100;
const FRAME_SAMPLES: usize = SAMPLE_RATE * FRAME_MS as usize / 1_000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceFeatures {
	pub features: Vec<f32>,
	pub frame_ms: u32,
	pub duration_ms: u64,
}

#[derive(Default)]
struct Extractor {
	features: Vec<f32>,
	count: usize,
	sum_sq: f64,
	diff_sq: f64,
	crossings: usize,
	last: Option<f32>,
}

impl Extractor {
	fn push(&mut self, sample: f32) {
		self.sum_sq += (sample as f64).powi(2);
		if let Some(last) = self.last {
			self.diff_sq += ((sample - last) as f64).powi(2);
			if (sample >= 0.0) != (last >= 0.0) {
				self.crossings += 1;
			}
		}
		self.last = Some(sample);
		self.count += 1;
		if self.count == FRAME_SAMPLES {
			let count = self.count as f64;
			self.features.push(((self.sum_sq / count).sqrt() * 1_000.0).ln_1p() as f32);
			self.features.push(((self.diff_sq / count).sqrt() * 1_000.0).ln_1p() as f32);
			self.features.push((self.crossings as f64 / count) as f32);
			self.count = 0;
			self.sum_sq = 0.0;
			self.diff_sq = 0.0;
			self.crossings = 0;
		}
	}
}

pub fn extract(path: String) -> Result<ReferenceFeatures, String> {
	let path = PathBuf::from(path);
	if !path.is_file() {
		return Err("Reference audio file not found".into());
	}
	let allowed = ["mp3", "m4a", "aac", "wav", "flac", "ogg", "opus"];
	let extension = path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
	if !allowed.contains(&extension.as_str()) {
		return Err("Choose an MP3, M4A, AAC, WAV, FLAC, OGG or Opus reference audio file".into());
	}

	let mut child = Command::new(crate::ffmpeg::resolve_ffmpeg()?)
		.args([
			"-hide_banner",
			"-loglevel",
			"error",
			"-nostdin",
			"-i",
		])
		.arg(&path)
		.args(["-vn", "-ac", "1", "-ar", "8000", "-f", "f32le", "pipe:1"])
		.stdout(Stdio::piped())
		.stderr(Stdio::null())
		.spawn()
		.map_err(|error| format!("Could not read reference audio: {error}"))?;

	let mut stdout = match child.stdout.take() {
		Some(stdout) => stdout,
		None => {
			let _ = child.kill();
			let _ = child.wait();
			return Err("Reference decoder did not start".into());
		}
	};
	let mut extractor = Extractor::default();
	let mut bytes = [0_u8; 32 * 1024];
	let mut carry = Vec::with_capacity(3);
	loop {
		let read = match stdout.read(&mut bytes) {
			Ok(read) => read,
			Err(error) => {
				let _ = child.kill();
				let _ = child.wait();
				return Err(error.to_string());
			}
		};
		if read == 0 {
			break;
		}
		carry.extend_from_slice(&bytes[..read]);
		let complete = carry.len() / 4 * 4;
		for chunk in carry[..complete].chunks_exact(4) {
			extractor.push(f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]));
		}
		carry.drain(..complete);
	}
	let status = child.wait().map_err(|error| error.to_string())?;
	if !status.success() {
		return Err("Reference audio could not be decoded".into());
	}
	if extractor.features.len() < 3 * 20 {
		return Err("Reference audio is too short to match reliably".into());
	}
	let frames = extractor.features.len() / 3;
	Ok(ReferenceFeatures {
		features: extractor.features,
		frame_ms: FRAME_MS,
		duration_ms: frames as u64 * FRAME_MS as u64,
	})
}

#[cfg(test)]
mod tests {
	use super::{Extractor, FRAME_SAMPLES};

	#[test]
	fn emits_one_finite_feature_triplet_per_frame() {
		let mut extractor = Extractor::default();
		for index in 0..FRAME_SAMPLES * 2 {
			extractor.push(if index % 8 < 4 { 0.5 } else { -0.5 });
		}
		assert_eq!(extractor.features.len(), 6);
		assert!(extractor.features.iter().all(|value| value.is_finite()));
		assert!(extractor.features[2] > 0.0);
	}
}
