use std::io::Read;
use tauri_plugin_dialog::DialogExt;

fn extensions(kind: &str) -> Result<&'static [&'static str], String> {
	match kind {
		"audio" => Ok(&["mp3", "wav", "m4a", "aac", "aiff", "aif", "flac"]),
		"subtitle" => Ok(&["srt"]),
		_ => Err("Unknown service file type".into()),
	}
}

// Pick and read in one command: only the file approved in the native picker
// can be read, without granting the webview general filesystem access.
#[tauri::command]
pub async fn pick_service_file(app: tauri::AppHandle, kind: String) -> Result<tauri::ipc::Response, String> {
	let allowed = extensions(&kind)?;
	tauri::async_runtime::spawn_blocking(move || {
		let chosen = app.dialog().file()
			.set_title(if kind == "audio" { "Choose programme audio" } else { "Choose sermon subtitles" })
			.add_filter(if kind == "audio" { "Audio" } else { "SubRip subtitles" }, allowed)
			.blocking_pick_file();
		let Some(chosen) = chosen else { return Ok(tauri::ipc::Response::new(Vec::new())); };
		let path = chosen.into_path().map_err(|error| error.to_string())?;
		let extension = path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
		if !allowed.contains(&extension.as_str()) { return Err("Choose a compatible file".into()); }
		let name = path.file_name().ok_or("Missing filename")?.to_string_lossy();
		let limit = if kind == "subtitle" { 5 * 1024 * 1024 } else { 512 * 1024 * 1024 };
		let file = std::fs::File::open(&path).map_err(|error| error.to_string())?;
		if file.metadata().map_err(|error| error.to_string())?.len() > limit { return Err("This file is too large".into()); }
		let mut bytes = Vec::new();
		file.take(limit + 1).read_to_end(&mut bytes).map_err(|error| error.to_string())?;
		if bytes.len() as u64 > limit { return Err("This file is too large".into()); }
		// Binary IPC avoids expanding a long sermon into a JSON array of bytes.
		let mut response = (name.len() as u32).to_le_bytes().to_vec();
		response.extend_from_slice(name.as_bytes());
		response.extend_from_slice(&bytes);
		Ok(tauri::ipc::Response::new(response))
	}).await.map_err(|error| error.to_string())?
}

#[test]
fn service_filters_exclude_unrelated_formats() {
	assert!(!extensions("audio").unwrap().contains(&"srt"));
	assert!(!extensions("audio").unwrap().contains(&"jpeg"));
	assert!(extensions("audio").unwrap().contains(&"mp3"));
	assert_eq!(extensions("subtitle").unwrap(), &["srt"]);
	assert!(extensions("other").is_err());
}
