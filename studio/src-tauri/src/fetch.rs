//! Pull a YouTube (or any yt-dlp-supported) URL into the show as an ordinary
//! media source.
//!
//! Why the app fetches it and the webview does not: the program canvas IS the
//! broadcast (see compositor.ts), and googlevideo serves media without any
//! `Access-Control-Allow-Origin`. A cross-origin `<video>` drawn onto a canvas
//! taints it, and `captureStream()` on a tainted canvas throws — the whole
//! broadcast would stop the moment a YouTube clip went on air. The same rule
//! silences `createMediaElementSource`, so the audio would not reach the mix
//! either. Fetching here and handing the bytes over as a blob keeps the media
//! same-origin, which is exactly what the file picker already does.
//!
//! Live streams are refused on purpose: they never end, so there is nothing to
//! download. Window capture plus that browser's app audio is the way to put a
//! live page on air, and it already works.

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

// A macOS .app is launched by Finder, which does not source a login shell, so
// the homebrew and pip prefixes are missing from PATH. Look there explicitly —
// same reasoning as FFMPEG_CANDIDATES.
const YTDLP_CANDIDATES: &[&str] = &[
	"/opt/homebrew/bin/yt-dlp",
	"/usr/local/bin/yt-dlp",
	"/usr/bin/yt-dlp",
	"/opt/local/bin/yt-dlp",
];

/// ponytail: the file is handed over as one buffer, so it is held in memory
/// twice for a moment (here and as a Blob). Fine for music and a clip; if long
/// 1080p videos become normal, serve the file over Tauri's asset protocol
/// instead of returning bytes.
const MAX_BYTES: u64 = 1_500_000_000;

#[derive(Serialize, Clone)]
pub struct FetchProgress {
	pub percent: f32,
	pub stage: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Fetched {
	pub title: String,
	pub is_live: bool,
	pub duration: f64,
}

fn resolve_ytdlp() -> Result<PathBuf, String> {
	if let Ok(explicit) = std::env::var("YTDLP_PATH") {
		let p = PathBuf::from(explicit);
		if p.is_file() {
			return Ok(p);
		}
	}
	for candidate in YTDLP_CANDIDATES {
		let p = PathBuf::from(candidate);
		if p.is_file() {
			return Ok(p);
		}
	}
	if Command::new("yt-dlp")
		.arg("--version")
		.stdout(Stdio::null())
		.stderr(Stdio::null())
		.status()
		.is_ok()
	{
		return Ok(PathBuf::from("yt-dlp"));
	}
	Err("yt-dlp introuvable. Installez-le (brew install yt-dlp) ou définissez YTDLP_PATH.".into())
}

/// The webview hands this straight to a subprocess argument. It is never passed
/// through a shell, but a URL that can name a file or carry an option would
/// still be wrong, so only plain https gets through.
pub fn check_url(url: &str) -> Result<(), String> {
	if !url.starts_with("https://") || url.len() > 2048 {
		return Err("URL non supportée : https uniquement.".into());
	}
	if url.chars().any(|c| c.is_control() || c.is_whitespace()) {
		return Err("URL invalide.".into());
	}
	Ok(())
}

/// Ask yt-dlp what this URL is, without downloading anything. Cheap enough to
/// run before every fetch, which is what keeps a live stream from starting a
/// download that would never finish.
pub fn probe(url: &str) -> Result<Fetched, String> {
	check_url(url)?;
	let bin = resolve_ytdlp()?;
	let out = Command::new(&bin)
		.args([
			"--no-warnings",
			"--no-playlist",
			"--print",
			"%(is_live)s\n%(title)s\n%(duration)s",
			url,
		])
		.output()
		.map_err(|e| format!("yt-dlp: {e}"))?;
	if !out.status.success() {
		let err = String::from_utf8_lossy(&out.stderr);
		// yt-dlp's own message names the real problem (private, removed,
		// region-locked); passing it through beats "échec".
		return Err(err.lines().last().unwrap_or("Lecture impossible.").to_string());
	}
	let text = String::from_utf8_lossy(&out.stdout);
	let mut lines = text.lines();
	let is_live = lines.next().unwrap_or("False").trim() == "True";
	let title = lines.next().unwrap_or("").trim().to_string();
	let duration = lines.next().unwrap_or("").trim().parse::<f64>().unwrap_or(0.0);
	Ok(Fetched {
		title,
		is_live,
		duration,
	})
}

/// Download the URL and return the file's bytes. `audio_only` picks a single
/// audio track, which needs no merge and is what playing music from YouTube
/// actually wants.
pub fn fetch(app: &AppHandle, url: &str, audio_only: bool) -> Result<Vec<u8>, String> {
	let info = probe(url)?;
	if info.is_live {
		return Err(
			"Direct en cours : rien à télécharger. Utilisez une capture de fenêtre du navigateur \
			 avec le son de l'application."
				.into(),
		);
	}
	let bin = resolve_ytdlp()?;

	let dir = std::env::temp_dir().join(format!("studio-fetch-{}", std::process::id()));
	// A previous run that died before its cleanup would otherwise leave a file
	// here, and the "one file in the directory" read below would find two.
	let _ = std::fs::remove_dir_all(&dir);
	std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

	let output = dir.join("media.%(ext)s");
	let mut args: Vec<String> = vec![
		"--no-warnings".into(),
		"--no-playlist".into(),
		"--newline".into(),
		"--progress-template".into(),
		"download:PCT %(progress._percent_str)s".into(),
		"-o".into(),
		output.to_string_lossy().into_owned(),
	];
	if audio_only {
		// m4a first: AAC in an mp4 container is what WebKit plays natively, and
		// it needs no remux. Opus/webm would have to go through ffmpeg.
		args.push("-f".into());
		args.push("bestaudio[ext=m4a]/bestaudio".into());
	} else {
		// Capped at 1080p: the canvas is 1080p at most, so a 4K download would
		// be minutes of waiting thrown away in the downscale.
		args.push("-f".into());
		args.push("bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best".into());
		args.push("--merge-output-format".into());
		args.push("mp4".into());
	}
	// yt-dlp needs ffmpeg to merge the separate video and audio tracks, and a
	// Finder-launched .app has the same empty PATH problem here as we do.
	if let Ok(ff) = crate::ffmpeg::resolve_ffmpeg() {
		if let Some(parent) = ff.parent() {
			args.push("--ffmpeg-location".into());
			args.push(parent.to_string_lossy().into_owned());
		}
	}
	args.push(url.to_string());

	let mut child = Command::new(&bin)
		.args(&args)
		.stdout(Stdio::piped())
		.stderr(Stdio::piped())
		.spawn()
		.map_err(|e| format!("yt-dlp: {e}"))?;

	if let Some(stdout) = child.stdout.take() {
		let app = app.clone();
		// Progress is read on its own thread: yt-dlp writes a line per chunk and
		// a full pipe would stall the download.
		thread_spawn_progress(app, stdout);
	}
	let mut stderr_tail = String::new();
	if let Some(err) = child.stderr.take() {
		for line in BufReader::new(err).lines().map_while(Result::ok) {
			stderr_tail = line;
		}
	}

	let status = child.wait().map_err(|e| e.to_string())?;
	if !status.success() {
		let _ = std::fs::remove_dir_all(&dir);
		return Err(if stderr_tail.is_empty() {
			"Téléchargement échoué.".into()
		} else {
			stderr_tail
		});
	}

	// Whatever extension it settled on, it is the only file in there.
	let entry = std::fs::read_dir(&dir)
		.map_err(|e| e.to_string())?
		.filter_map(Result::ok)
		.find(|e| e.path().is_file())
		.ok_or_else(|| "Fichier introuvable après téléchargement.".to_string())?;

	let path = entry.path();
	let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
	if size > MAX_BYTES {
		let _ = std::fs::remove_dir_all(&dir);
		return Err("Fichier trop volumineux pour être chargé.".into());
	}
	let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
	let _ = std::fs::remove_dir_all(&dir);
	Ok(bytes)
}

fn thread_spawn_progress(app: AppHandle, stdout: std::process::ChildStdout) {
	std::thread::spawn(move || {
		for line in BufReader::new(stdout).lines().map_while(Result::ok) {
			let Some(rest) = line.strip_prefix("PCT ") else {
				continue;
			};
			let percent = rest.trim().trim_end_matches('%').parse::<f32>().unwrap_or(0.0);
			let _ = app.emit(
				"media-fetch",
				FetchProgress {
					percent,
					stage: "download".into(),
				},
			);
		}
		// The merge runs after the last progress line and can take a while on a
		// long video; say so rather than sitting at 100%.
		let _ = app.emit(
			"media-fetch",
			FetchProgress {
				percent: 100.0,
				stage: "finish".into(),
			},
		);
	});
}

#[cfg(test)]
mod tests {
	use super::check_url;

	#[test]
	fn only_plain_https_urls_are_accepted() {
		assert!(check_url("https://www.youtube.com/watch?v=abc").is_ok());
		// A shell is never involved, but an argument that can name a file or
		// smuggle an option must not reach yt-dlp.
		assert!(check_url("file:///etc/passwd").is_err());
		assert!(check_url("http://example.com").is_err());
		assert!(check_url("https://x.com/a b").is_err());
		assert!(check_url("https://x.com/a\nb").is_err());
		assert!(check_url(&format!("https://x.com/{}", "a".repeat(2100))).is_err());
	}
}
