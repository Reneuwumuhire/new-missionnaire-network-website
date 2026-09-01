//! Play a YouTube link without downloading it first.
//!
//! Why this goes through the app at all: the program canvas IS the broadcast
//! (see compositor.ts), and googlevideo serves media with no
//! `Access-Control-Allow-Origin`. A cross-origin `<video>` drawn onto a canvas
//! taints it, and `captureStream()` on a tainted canvas throws — the broadcast
//! would stop the moment a clip went on air. The same rule silences
//! `createMediaElementSource`, so the sound would not reach the mix either.
//!
//! So the webview plays `ytstream://s?id=…`, this module answers it, and the
//! response carries the CORS header the origin never sent. Range requests are
//! forwarded, which is what keeps the transport bar's scrubbing working.
//!
//! The webview never holds the signed media URL: `resolve` keeps it here and
//! hands back a token. The proxy can therefore only ever fetch something it
//! resolved itself, not an arbitrary address the page asked for.
//!
//! Live streams are refused. Their HLS manifest names segments by absolute
//! googlevideo URL, so playback would leave this proxy on the first segment and
//! taint the canvas anyway. Window capture plus that browser's app audio is the
//! way to put a live page on air, and it already works.

use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::Serialize;

// A macOS .app is launched by Finder, which does not source a login shell, so
// the homebrew and pip prefixes are missing from PATH. Look there explicitly —
// same reasoning as FFMPEG_CANDIDATES.
const YTDLP_CANDIDATES: &[&str] = &[
	"/opt/homebrew/bin/yt-dlp",
	"/usr/local/bin/yt-dlp",
	"/usr/bin/yt-dlp",
	"/opt/local/bin/yt-dlp",
];

/// A player asking for "the rest of the file" must not be answered with the
/// rest of the file: an hour of audio in one response would stall playback and
/// sit in memory. Anything open-ended is served a chunk at a time.
const CHUNK: u64 = 1_048_576;

/// Signed googlevideo URLs resolved this run, by token. Cleared when the app
/// exits; they expire on Google's side in a few hours anyway.
#[derive(Default)]
pub struct Streams(Mutex<HashMap<String, String>>);

static NEXT_TOKEN: AtomicU64 = AtomicU64::new(1);

impl Streams {
	pub fn put(&self, url: String) -> String {
		let token = format!("s{}", NEXT_TOKEN.fetch_add(1, Ordering::Relaxed));
		if let Ok(mut map) = self.0.lock() {
			map.insert(token.clone(), url);
		}
		token
	}

	pub fn get(&self, token: &str) -> Option<String> {
		self.0.lock().ok()?.get(token).cloned()
	}
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Resolved {
	pub token: String,
	pub title: String,
	pub duration: f64,
	/// True when the single-file format the player can actually handle is a
	/// step down from what the link offers, so the UI can say so instead of
	/// quietly serving a soft picture.
	pub reduced: bool,
}

fn resolve_ytdlp() -> Result<std::path::PathBuf, String> {
	if let Ok(explicit) = std::env::var("YTDLP_PATH") {
		let p = std::path::PathBuf::from(explicit);
		if p.is_file() {
			return Ok(p);
		}
	}
	for candidate in YTDLP_CANDIDATES {
		let p = std::path::PathBuf::from(candidate);
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
		return Ok(std::path::PathBuf::from("yt-dlp"));
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

/// Refusing a live stream is not a dead end, so the message names the way that
/// does work — and that way already ships.
const LIVE_HINT: &str = "Direct en cours : le flux ne peut pas être relayé ici. Mettez-le à \
	l'antenne avec une capture de fenêtre du navigateur, et ajoutez ce navigateur dans la capture \
	audio d'application pour le son.";

/// Second opinion, asked only when format selection has already failed.
fn is_live(bin: &std::path::Path, url: &str) -> bool {
	Command::new(bin)
		.args(["--no-warnings", "--no-playlist", "--print", "%(is_live)s", url])
		.output()
		.map(|out| String::from_utf8_lossy(&out.stdout).trim() == "True")
		.unwrap_or(false)
}

/// The format a `<video>` element can play from one address.
///
/// Audio is unconstrained: `bestaudio[ext=m4a]` is a single AAC track and the
/// best the link has. Picture is the catch — above 360p YouTube only serves
/// separate video-only and audio-only streams, which one element cannot play,
/// so the muxed format is the ceiling for streaming.
fn format_for(audio_only: bool) -> &'static str {
	if audio_only {
		"bestaudio[ext=m4a]/bestaudio"
	} else {
		"best[ext=mp4][acodec!=none]/best[acodec!=none]"
	}
}

/// Resolve a link to a direct media address and keep it here, returning a token
/// the webview can play through the `ytstream` protocol.
///
/// One yt-dlp call, not two: negotiating with YouTube is the slow part (~15 s),
/// and asking what the link is and where its media lives are the same question.
pub fn resolve(streams: &Streams, url: &str, audio_only: bool) -> Result<Resolved, String> {
	check_url(url)?;
	let bin = resolve_ytdlp()?;
	let out = Command::new(&bin)
		.args([
			"--no-warnings",
			"--no-playlist",
			"-f",
			format_for(audio_only),
			"--print",
			"%(is_live)s\n%(title)s\n%(duration)s\n%(height)s\n%(urls)s",
			url,
		])
		.output()
		.map_err(|e| format!("yt-dlp: {e}"))?;
	if !out.status.success() {
		// A live stream has no muxed format, so selection fails before is_live is
		// ever printed and the operator would get "Requested format is not
		// available" instead of the one thing that does work. Only the error path
		// pays for the second call.
		if is_live(&bin, url) {
			return Err(LIVE_HINT.into());
		}
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
	let height = lines.next().unwrap_or("").trim().parse::<u32>().unwrap_or(0);
	let direct = lines.next().unwrap_or("").trim().to_string();

	if is_live {
		return Err(LIVE_HINT.into());
	}
	if !direct.starts_with("https://") {
		return Err("Aucun format lisible d'un seul tenant pour ce lien.".into());
	}

	Ok(Resolved {
		token: streams.put(direct),
		title: if title.is_empty() { "YouTube".into() } else { title },
		duration,
		reduced: !audio_only && height > 0 && height < 720,
	})
}

/// One range of the media, fetched with curl.
///
/// ponytail: a process per range request. A player asks for a handful of large
/// ranges rather than a stream of small ones, so this stays cheap; if it ever
/// shows up in a profile, hold one connection open instead. curl rather than a
/// Rust client because reqwest is in the tree without any TLS backend, and
/// adding one would pull in a stack of crates to do what curl already does.
pub struct Chunk {
	pub status: u16,
	pub body: Vec<u8>,
	pub content_type: String,
	pub content_range: Option<String>,
}

pub fn chunk(url: &str, range: Option<&str>) -> Result<Chunk, String> {
	// Only ever a URL this app resolved, and curl is spawned directly rather
	// than through a shell — but a stray option would still be wrong.
	check_url(url)?;

	let (start, end) = parse_range(range);
	let end = end.unwrap_or(start + CHUNK - 1);
	let mut cmd = Command::new("curl");
	cmd.args([
		"-sS",
		"-L",
		"--max-time",
		"60",
		// Headers to stderr, body to stdout: two pipes, so neither has to be
		// parsed out of the other.
		"-D",
		"/dev/stderr",
		"-r",
		&format!("{start}-{end}"),
		"--",
		url,
	]);
	let out = cmd.output().map_err(|e| format!("curl: {e}"))?;
	if !out.status.success() {
		return Err(format!(
			"curl {}: {}",
			out.status,
			String::from_utf8_lossy(&out.stderr)
		));
	}
	let headers = String::from_utf8_lossy(&out.stderr);
	// -L follows redirects, so several header blocks can arrive; the last one
	// describes the response we actually got.
	let last = headers.rsplit("\r\n\r\n").find(|b| b.contains("HTTP/")).unwrap_or(&headers);
	let header = |name: &str| -> Option<String> {
		last.lines()
			.find(|l| l.to_ascii_lowercase().starts_with(&format!("{name}:")))
			.and_then(|l| l.split_once(':'))
			.map(|(_, v)| v.trim().to_string())
	};
	let content_range = header("content-range");
	Ok(Chunk {
		status: if content_range.is_some() { 206 } else { 200 },
		content_type: header("content-type").unwrap_or_else(|| "application/octet-stream".into()),
		content_range,
		body: out.stdout,
	})
}

/// `bytes=start-end`, either end optional. Anything unparseable starts at zero,
/// which is what a player without a Range header wants anyway.
pub fn parse_range(range: Option<&str>) -> (u64, Option<u64>) {
	let Some(spec) = range.and_then(|r| r.trim().strip_prefix("bytes=")) else {
		return (0, None);
	};
	let Some((from, to)) = spec.split_once('-') else {
		return (0, None);
	};
	let start = from.trim().parse::<u64>().unwrap_or(0);
	let end = to.trim().parse::<u64>().ok();
	// A suffix range ("bytes=-500") has no start; serving from zero is wrong but
	// safe, and no engine we ship on asks for one.
	(start, end.filter(|e| *e >= start))
}

#[cfg(test)]
mod tests {
	use super::{check_url, format_for, parse_range, Streams};

	#[test]
	fn only_plain_https_urls_are_accepted() {
		assert!(check_url("https://www.youtube.com/watch?v=abc").is_ok());
		// A shell is never involved, but an argument that can name a file or
		// smuggle an option must not reach yt-dlp or curl.
		assert!(check_url("file:///etc/passwd").is_err());
		assert!(check_url("http://example.com").is_err());
		assert!(check_url("https://x.com/a b").is_err());
		assert!(check_url("https://x.com/a\nb").is_err());
		assert!(check_url(&format!("https://x.com/{}", "a".repeat(2100))).is_err());
	}

	#[test]
	fn ranges_survive_every_shape_a_player_sends() {
		assert_eq!(parse_range(None), (0, None));
		assert_eq!(parse_range(Some("bytes=0-")), (0, None));
		assert_eq!(parse_range(Some("bytes=100-199")), (100, Some(199)));
		assert_eq!(parse_range(Some("bytes=5000-")), (5000, None));
		// Nonsense must not panic or invert the range.
		assert_eq!(parse_range(Some("pages=1-2")), (0, None));
		assert_eq!(parse_range(Some("bytes=200-100")), (200, None));
	}

	#[test]
	fn tokens_round_trip_and_are_not_guessable_from_the_page() {
		let streams = Streams::default();
		let a = streams.put("https://example.com/a".into());
		let b = streams.put("https://example.com/b".into());
		assert_ne!(a, b);
		assert_eq!(streams.get(&a).as_deref(), Some("https://example.com/a"));
		// A token the app never issued resolves to nothing, so the proxy cannot
		// be pointed at an arbitrary address.
		assert_eq!(streams.get("s999"), None);
	}

	#[test]
	fn picture_formats_must_carry_their_own_sound() {
		// One element, one address: a video-only DASH stream would play silent.
		assert!(format_for(false).contains("acodec!=none"));
		assert!(format_for(true).starts_with("bestaudio"));
	}
}
