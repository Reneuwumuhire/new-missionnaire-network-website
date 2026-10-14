use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

const CHUNK: u64 = 1_048_576;
static NEXT_TOKEN: AtomicU64 = AtomicU64::new(1);

#[derive(Default)]
pub struct LocalMedia(Mutex<HashMap<String, PathBuf>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisteredMedia {
	pub path: String,
	pub name: String,
	pub size: u64,
	pub token: String,
}

fn content_type(path: &Path) -> Option<&'static str> {
	match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
		"png" => Some("image/png"),
		"jpg" | "jpeg" => Some("image/jpeg"),
		"gif" => Some("image/gif"),
		"webp" => Some("image/webp"),
		"bmp" => Some("image/bmp"),
		"mp4" | "m4v" => Some("video/mp4"),
		"mov" => Some("video/quicktime"),
		"webm" => Some("video/webm"),
		"mp3" => Some("audio/mpeg"),
		"m4a" | "aac" => Some("audio/mp4"),
		"wav" => Some("audio/wav"),
		"flac" => Some("audio/flac"),
		"ogg" | "opus" => Some("audio/ogg"),
		"aiff" | "aif" => Some("audio/aiff"),
		_ => None,
	}
}

impl LocalMedia {
	pub fn register(&self, path: &Path) -> Result<RegisteredMedia, String> {
		let path = path.canonicalize().map_err(|error| error.to_string())?;
		if !path.is_file() || content_type(&path).is_none() {
			return Err("Choose a supported image, video or audio file".into());
		}
		let size = path.metadata().map_err(|error| error.to_string())?.len();
		if size == 0 { return Err("This file is empty".into()); }
		let name = path.file_name().ok_or("Missing filename")?.to_string_lossy().into_owned();
		let token = format!("l{}", NEXT_TOKEN.fetch_add(1, Ordering::Relaxed));
		self.0.lock().map_err(|error| error.to_string())?.insert(token.clone(), path.clone());
		Ok(RegisteredMedia { path: path.to_string_lossy().into_owned(), name, size, token })
	}

	pub fn get(&self, token: &str) -> Option<PathBuf> {
		self.0.lock().ok()?.get(token).cloned()
	}
}

#[tauri::command]
pub async fn pick_local_media(app: tauri::AppHandle, kind: String) -> Result<Option<RegisteredMedia>, String> {
	let (label, extensions): (&str, &[&str]) = match kind.as_str() {
		"image" => ("Images", &["png", "jpg", "jpeg", "gif", "webp", "bmp"]),
		"video" => ("Video and audio", &["mp4", "m4v", "mov", "webm", "mp3", "m4a", "aac", "wav", "flac", "ogg", "opus", "aiff", "aif"]),
		"audio" => ("Audio", &["mp3", "m4a", "aac", "wav", "flac", "aiff", "aif"]),
		_ => return Err("Unknown media type".into()),
	};
	tauri::async_runtime::spawn_blocking(move || {
		let chosen = app.dialog().file().add_filter(label, extensions).blocking_pick_file();
		let Some(chosen) = chosen else { return Ok(None); };
		let path = chosen.into_path().map_err(|error| error.to_string())?;
		app.state::<LocalMedia>().register(&path).map(Some)
	}).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn register_local_media(media: tauri::State<'_, LocalMedia>, path: String) -> Result<RegisteredMedia, String> {
	media.register(Path::new(&path))
}

pub struct Part {
	pub status: u16,
	pub content_type: &'static str,
	pub content_range: Option<String>,
	pub body: Vec<u8>,
}

pub fn chunk(path: &Path, range: Option<&str>) -> Result<Part, String> {
	let mut file = File::open(path).map_err(|error| error.to_string())?;
	let len = file.metadata().map_err(|error| error.to_string())?.len();
	let requested = range.and_then(|value| value.strip_prefix("bytes="))
		.and_then(|value| value.split_once('-'))
		.and_then(|(start, end)| Some((start.parse::<u64>().ok()?, end.parse::<u64>().ok())));
	let start = requested.map(|(start, _)| start).unwrap_or(0);
	if start >= len && len > 0 { return Err("Range outside file".into()); }
	let end = requested.and_then(|(_, end)| end).unwrap_or(u64::MAX)
		.min(start.saturating_add(CHUNK - 1)).min(len.saturating_sub(1));
	if end < start { return Err("Invalid range".into()); }
	file.seek(SeekFrom::Start(start)).map_err(|error| error.to_string())?;
	let mut body = Vec::with_capacity((end - start + 1) as usize);
	file.take(end - start + 1).read_to_end(&mut body).map_err(|error| error.to_string())?;
	Ok(Part {
		status: if range.is_some() || len > CHUNK { 206 } else { 200 },
		content_type: content_type(path).ok_or("Unsupported file")?,
		content_range: if range.is_some() || len > CHUNK { Some(format!("bytes {start}-{end}/{len}")) } else { None },
		body,
	})
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn serves_bounded_ranges() {
		let path = std::env::temp_dir().join(format!("studio-local-media-{}.mp4", std::process::id()));
		std::fs::write(&path, b"abcdefghij").unwrap();
		let part = chunk(&path, Some("bytes=4-")).unwrap();
		assert_eq!(part.status, 206);
		assert_eq!(part.content_range.as_deref(), Some("bytes 4-9/10"));
		assert_eq!(part.body, b"efghij");
		let short = chunk(&path, Some("bytes=2-4")).unwrap();
		assert_eq!(short.content_range.as_deref(), Some("bytes 2-4/10"));
		assert_eq!(short.body, b"cde");
		std::fs::remove_file(path).unwrap();
	}
}
