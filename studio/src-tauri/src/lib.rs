mod appaudio;
mod fetch;
mod ffmpeg;
mod reference;

use ffmpeg::{Encoder, FfmpegInfo, StreamConfig};
use serde::Serialize;
use std::process::Command;
use tauri::{
	menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, HELP_SUBMENU_ID},
	AppHandle, Emitter, Manager, State,
};

const MENU_SETTINGS: &str = "studio-settings";
const MENU_HELP: &str = "studio-help";
const MENU_GETTING_STARTED: &str = "studio-getting-started";
const MENU_SHORTCUTS: &str = "studio-keyboard-shortcuts";
const MENU_TROUBLESHOOTING: &str = "studio-troubleshooting";
const MENU_SYSTEM_INFO: &str = "studio-system-information";

fn notify_close_blocked(app: &AppHandle) {
	if let Some(window) = app.get_webview_window("main") {
		let _ = window.show();
		let _ = window.set_focus();
	}
	let _ = app.emit_to("main", "studio://close-blocked", ());
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StartedStream {
	command: Vec<String>,
	local_recording_path: Option<String>,
	run_id: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordingSpace {
	path: String,
	available_bytes: u64,
}

#[cfg(unix)]
fn available_space(path: &std::path::Path) -> Result<u64, String> {
	let output = Command::new("df")
		.args(["-Pk"])
		.arg(path)
		.output()
		.map_err(|error| format!("Espace disque illisible: {error}"))?;
	if !output.status.success() {
		return Err("Espace disque illisible".into());
	}
	let line = String::from_utf8_lossy(&output.stdout)
		.lines()
		.last()
		.ok_or("Réponse disque vide")?
		.to_string();
	let available_kib = line
		.split_whitespace()
		.nth(3)
		.ok_or("Espace disque absent")?
		.parse::<u64>()
		.map_err(|error| format!("Espace disque invalide: {error}"))?;
	Ok(available_kib.saturating_mul(1024))
}

#[cfg(windows)]
fn available_space(path: &std::path::Path) -> Result<u64, String> {
	let drive = path
		.to_string_lossy()
		.chars()
		.next()
		.filter(|value| value.is_ascii_alphabetic())
		.ok_or("Lecteur d’enregistrement introuvable")?;
	let output = Command::new("powershell")
		.args([
			"-NoProfile",
			"-Command",
			&format!("(Get-PSDrive -Name {}).Free", drive),
		])
		.output()
		.map_err(|error| format!("Espace disque illisible: {error}"))?;
	String::from_utf8_lossy(&output.stdout)
		.trim()
		.parse::<u64>()
		.map_err(|error| format!("Espace disque invalide: {error}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StudioDeviceInfo {
	os: &'static str,
	architecture: &'static str,
	username: String,
	device_name: String,
	app_version: String,
}

#[tauri::command]
fn studio_device_info(app: AppHandle) -> StudioDeviceInfo {
	let os = match std::env::consts::OS {
		"macos" => "macOS",
		"windows" => "Windows",
		"linux" => "Linux",
		other => other,
	};
	let username = std::env::var("USER")
		.or_else(|_| std::env::var("USERNAME"))
		.unwrap_or_else(|_| "Unknown user".into());
	let device_name = std::env::var("COMPUTERNAME")
		.ok()
		.or_else(|| std::env::var("HOSTNAME").ok())
		.or_else(|| {
			Command::new("hostname")
				.output()
				.ok()
				.map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned())
		})
		.filter(|name| !name.is_empty())
		.unwrap_or_else(|| "Unknown device".into());
	StudioDeviceInfo {
		os,
		architecture: std::env::consts::ARCH,
		username,
		device_name,
		app_version: app.package_info().version.to_string(),
	}
}

fn allowed_web_url(url: &str) -> bool {
	if url.chars().any(|c| c.is_control() || c.is_whitespace()) {
		return false;
	}
	if url.starts_with("https://") {
		return true;
	}
	let Some(rest) = url.strip_prefix("http://") else {
		return false;
	};
	let authority = rest.split('/').next().unwrap_or_default();
	if authority == "[::1]" {
		return true;
	}
	let (host, port) = authority.rsplit_once(':').unwrap_or((authority, ""));
	(host == "localhost" || host == "127.0.0.1" || host == "[::1]")
		&& (port.is_empty() || port.chars().all(|c| c.is_ascii_digit()))
}

#[cfg(test)]
mod url_tests {
	use super::allowed_web_url;

	#[test]
	fn only_https_or_real_loopback_is_allowed() {
		assert!(allowed_web_url("https://missionnaire.net"));
		assert!(allowed_web_url("http://localhost:8081"));
		assert!(allowed_web_url("http://127.0.0.1/api"));
		assert!(!allowed_web_url("http://localhost.example/api"));
		assert!(!allowed_web_url("http://example.com"));
	}
}

#[tauri::command]
fn check_ffmpeg() -> Result<FfmpegInfo, String> {
	ffmpeg::probe_ffmpeg()
}

#[tauri::command]
fn recording_space(app: AppHandle) -> Result<RecordingSpace, String> {
	let path = app
		.path()
		.video_dir()
		.map_err(|error| format!("Dossier Vidéos/Films introuvable: {error}"))?
		.join("Missionnaire Studio");
	let probe = path.parent().unwrap_or(&path);
	Ok(RecordingSpace {
		available_bytes: available_space(probe)?,
		path: path.to_string_lossy().to_string(),
	})
}

#[tauri::command]
async fn extract_reference_features(path: String) -> Result<reference::ReferenceFeatures, String> {
	tauri::async_runtime::spawn_blocking(move || reference::extract(path))
		.await
		.map_err(|error| error.to_string())?
}

/// Returns the ffmpeg command line with stream keys redacted, so the UI can
/// show exactly what is running without leaking secrets into a screenshot.
#[tauri::command]
fn start_stream(
	app: AppHandle,
	encoder: State<'_, Encoder>,
	config: StreamConfig,
	group: String,
) -> Result<StartedStream, String> {
	let (command, local_recording_path, run_id) = encoder.start(&app, config, &group)?;
	Ok(StartedStream { command, local_recording_path, run_id })
}

fn studio_post(body: String, authorization: String, base_url: String, path: &str) -> Result<String, String> {
	if authorization.len() < 20 { return Err("Connectez Studio à l’administration d’abord".into()); }
	if body.len() > 2048 {
		return Err("Commande Studio non autorisée".into());
	}
	if !allowed_web_url(&base_url) {
		return Err("URL du site invalide".into());
	}
	let output = Command::new("curl")
		.args([
			"--fail-with-body",
			"--silent",
			"--show-error",
			"--retry",
			"2",
			"--retry-delay",
			"1",
			"--max-time",
			"30",
			"-X",
			"POST",
		])
		.arg("-H").arg(format!("Authorization: Bearer {authorization}"))
		.args(["-H", "Content-Type: application/json", "--data"])
		.arg(body)
		.arg(format!("{}{path}", base_url.trim_end_matches('/')))
		.output()
		.map_err(|e| format!("Site inaccessible: {e}"))?;
	if !output.status.success() {
		let response = String::from_utf8_lossy(&output.stdout);
		return Err(if response.trim().is_empty() {
			String::from_utf8_lossy(&output.stderr).trim().to_string()
		} else {
			serde_json::from_str::<serde_json::Value>(&response)
				.ok()
				.and_then(|value| value.get("message").and_then(|message| message.as_str()).map(str::to_owned))
				.unwrap_or_else(|| response.trim().to_string())
		});
	}
	String::from_utf8(output.stdout).map_err(|e| e.to_string())
}

/// Fixed paths keep saved settings from turning Studio into a general HTTP client.
#[tauri::command]
async fn studio_live_post(body: String, authorization: String, base_url: String) -> Result<String, String> {
	tauri::async_runtime::spawn_blocking(move || studio_post(body, authorization, base_url, "/api/studio/live"))
		.await
		.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn studio_youtube_post(body: String, authorization: String, admin_url: String) -> Result<String, String> {
	tauri::async_runtime::spawn_blocking(move || studio_post(body, authorization, admin_url, "/api/studio/youtube"))
		.await
		.map_err(|e| e.to_string())?
}

#[tauri::command]
fn studio_open_login(code: String, admin_url: String) -> Result<(), String> {
	if code.len() < 20 || code.chars().any(|c| !c.is_ascii_alphanumeric() && c != '-') { return Err("Code Studio invalide".into()); }
	if !allowed_web_url(&admin_url) {
		return Err("URL d’administration invalide".into());
	}
	open_url(format!("{}/studio/connect?code={code}", admin_url.trim_end_matches('/')))
}

#[tauri::command]
fn studio_open_youtube_login(code: String, admin_url: String) -> Result<(), String> {
	if code.len() < 20 || code.chars().any(|c| !c.is_ascii_alphanumeric() && c != '-') { return Err("Code Studio invalide".into()); }
	if !allowed_web_url(&admin_url) {
		return Err("URL d’administration invalide".into());
	}
	open_url(format!("{}/studio/youtube?code={code}", admin_url.trim_end_matches('/')))
}

#[tauri::command]
fn focus_main_window(app: AppHandle) -> Result<(), String> {
	app.get_webview_window("main")
		.ok_or("Fenêtre Studio introuvable")?
		.set_focus()
		.map_err(|e| e.to_string())
}

/// Media chunks arrive as a raw IPC body (not JSON) — a JSON number array
/// would be ~6× the bytes and would stall the webview at broadcast bitrates.
#[tauri::command]
fn push_chunk(encoder: State<'_, Encoder>, request: tauri::ipc::Request<'_>) -> Result<(), String> {
	match request.body() {
		tauri::ipc::InvokeBody::Raw(bytes) => encoder.push(bytes),
		_ => Err("push_chunk attend un corps binaire".into()),
	}
}

#[tauri::command]
fn stop_stream(encoder: State<'_, Encoder>, group: Option<String>) -> Result<(), String> {
	encoder.stop_group(group.as_deref())
}

#[tauri::command]
fn abort_stream(encoder: State<'_, Encoder>, group: Option<String>) -> Result<(), String> {
	encoder.abort_group(group.as_deref())
}

#[tauri::command]
fn stream_running(encoder: State<'_, Encoder>) -> bool {
	encoder.is_running()
}

/// Set STUDIO_SELFTEST to an rtmp:// URL to make the app broadcast a real
/// scene to it for a few seconds on launch and print the outcome. It exercises
/// the exact production path — canvas → MediaRecorder → IPC → ffmpeg → RTMP —
/// which is the only way to prove the chain without a camera and a human.
#[tauri::command]
fn selftest_target() -> Option<String> {
	std::env::var("STUDIO_SELFTEST").ok().filter(|v| !v.is_empty())
}

/// Applications whose audio can be captured. Empty on systems without a
/// per-application capture API, which the UI reports as such.
#[tauri::command]
fn list_audio_apps() -> Result<Vec<appaudio::AudioApp>, String> {
	appaudio::list()
}

/// Every on-screen window with the application behind it. The webview's own
/// picker does not say what was shared, so the choice is matched against this.
#[tauri::command]
fn list_windows() -> Result<Vec<appaudio::AudioWindow>, String> {
	appaudio::list_windows()
}

/// Start capturing one application's audio for the mixer strip `id`. PCM
/// arrives on `channel` as interleaved stereo f32 at 48 kHz — the rate the
/// webview's AudioContext runs at, so nothing has to resample.
///
/// Several strips can capture different applications at once, as they can in
/// OBS; each one owns its own stream and stopping it leaves the others alone.
#[tauri::command]
fn start_app_audio(
	capture: State<'_, appaudio::Capture>,
	id: String,
	bundle_id: String,
	channel: tauri::ipc::Channel<tauri::ipc::InvokeResponseBody>,
) -> Result<(), String> {
	capture.start(&id, &bundle_id, channel)
}

/// One strip, or all of them when `id` is absent.
#[tauri::command]
fn stop_app_audio(capture: State<'_, appaudio::Capture>, id: Option<String>) {
	capture.stop(id.as_deref());
}

/// Open an external page in the operator's browser — used for the "YouTube is
/// receiving, go live over there" button. https only: this hands a string to
/// the OS shell, so it must not be able to name a file or a script.
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
	if !allowed_web_url(&url) || url.len() > 2048 {
		return Err("URL non supportée".into());
	}
	#[cfg(target_os = "macos")]
	let opener = "open";
	#[cfg(target_os = "linux")]
	let opener = "xdg-open";
	#[cfg(target_os = "windows")]
	let opener = "explorer";
	std::process::Command::new(opener)
		.arg(&url)
		.spawn()
		.map(|_| ())
		.map_err(|e| e.to_string())
}

#[tauri::command]
fn open_youtube_chat(app: AppHandle, url: String) -> Result<(), String> {
	if !allowed_web_url(&url) || !url.starts_with("https://www.youtube.com/live_chat?") {
		return Err("Invalid YouTube live chat URL".into());
	}
	if let Some(existing) = app.get_webview_window("youtube-live-chat") {
		let _ = existing.close();
	}
	let parsed = url.parse().map_err(|_| "Invalid YouTube live chat URL")?;
	tauri::WebviewWindowBuilder::new(
		&app,
		"youtube-live-chat",
		tauri::WebviewUrl::External(parsed),
	)
	.title("YouTube Live Chat")
	.inner_size(420.0, 760.0)
	.min_inner_size(320.0, 480.0)
	.build()
	.map(|_| ())
	.map_err(|error| error.to_string())
}

/// Open the macOS privacy pane for a device class, so a refused microphone has
/// somewhere to be un-refused. A fixed set rather than a URL from the webview:
/// this hands a string to the OS shell.
#[tauri::command]
fn open_privacy_settings(pane: String) -> Result<(), String> {
	let anchor = match pane.as_str() {
		"microphone" => "Privacy_Microphone",
		"camera" => "Privacy_Camera",
		"screen" => "Privacy_ScreenCapture",
		_ => return Err("Volet inconnu".into()),
	};
	#[cfg(target_os = "macos")]
	{
		std::process::Command::new("open")
			.arg(format!(
				"x-apple.systempreferences:com.apple.preference.security?{anchor}"
			))
			.spawn()
			.map(|_| ())
			.map_err(|e| e.to_string())
	}
	#[cfg(not(target_os = "macos"))]
	{
		let _ = anchor;
		Err("Disponible sur macOS uniquement".into())
	}
}

/// Turn a link into something the webview can play immediately: a token for the
/// `ytstream` protocol below. Nothing is downloaded here — only the address is
/// worked out, which takes a second or two.
#[tauri::command]
async fn resolve_media(
	app: AppHandle,
	url: String,
	audio_only: bool,
) -> Result<fetch::Resolved, String> {
	// spawn_blocking, not the async pool: this runs yt-dlp to completion and
	// would otherwise hold a runtime thread while it works.
	tauri::async_runtime::spawn_blocking(move || {
		fetch::resolve(&app.state::<fetch::Streams>(), &url, audio_only)
	})
	.await
	.map_err(|e| e.to_string())?
}

/// Bridge for webview logging — a packaged .app has no devtools console you can
/// reach from a terminal, so the UI sends anything worth seeing through here.
#[tauri::command]
fn report(line: String) {
	println!("[studio] {line}");
}

/// WebKit throttles timers and stops requestAnimationFrame entirely once macOS
/// marks a window as occluded — which is exactly what happens when the operator
/// puts their browser or notes in front of the Studio. For a normal app that is
/// a battery saving; for this one it freezes the broadcast on the last frame
/// drawn. Turning occlusion detection off keeps the compositor running at full
/// rate no matter what is stacked on top of the window.
///
/// Verified by the launch self-test: occluded and throttled it delivered ~1
/// media chunk per second and then stopped; with this off it holds 4/s.
#[cfg(target_os = "macos")]
fn keep_rendering_when_covered() {
	use objc2_foundation::{NSString, NSUserDefaults};
	let defaults = NSUserDefaults::standardUserDefaults();
	defaults.setBool_forKey(false, &NSString::from_str("NSWindowOcclusionDetectionEnabled"));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	#[cfg(target_os = "macos")]
	keep_rendering_when_covered();

	tauri::Builder::default()
		.menu(|app| {
			let app_version = app.package_info().version.to_string();
			// macOS treats `version` as a build number; an empty value prevents it
			// from repeating the public version in parentheses.
			#[cfg(target_os = "macos")]
			let (version, short_version) = (Some(String::new()), Some(app_version));
			#[cfg(not(target_os = "macos"))]
			let (version, short_version) = (Some(app_version), None);
			let about = PredefinedMenuItem::about(
				app,
				None,
				Some(AboutMetadata {
					name: Some("Missionnaire Studio".into()),
					version,
					short_version,
					authors: Some(vec!["Missionnaire Network".into()]),
					comments: Some(
						"Professional live broadcasting, translation, and synchronized subtitles."
							.into(),
					),
					copyright: Some("© 2026 Missionnaire Network".into()),
					website: Some("https://www.missionnaire.net".into()),
					website_label: Some("missionnaire.net".into()),
					credits: Some(
						"Live production for Missionnaire Network\nPowered by Tauri & FFmpeg".into(),
					),
					..Default::default()
				}),
			)?;
			let menu = Menu::default(app)?;

			#[cfg(target_os = "macos")]
			{
				let settings = MenuItem::with_id(
					app,
					MENU_SETTINGS,
					"Settings…",
					true,
					Some("CmdOrCtrl+,"),
				)?;
				let separator = PredefinedMenuItem::separator(app)?;
				let top_level = menu.items()?;

				// Replace Tauri's sparse About item, then put Settings in the native
				// application-menu position immediately below it.
				if let Some(submenu) = top_level.first().and_then(|item| item.as_submenu()) {
					submenu.remove_at(0)?;
					submenu.insert(&about, 0)?;
					submenu.insert_items(&[&settings, &separator], 2)?;
				}
			}
			#[cfg(target_os = "windows")]
			if let Some(file) = menu.items()?.first().and_then(|item| item.as_submenu()) {
				let settings = MenuItem::with_id(
					app,
					MENU_SETTINGS,
					"Settings…",
					true,
					Some("CmdOrCtrl+,"),
				)?;
				file.insert_items(&[&settings, &PredefinedMenuItem::separator(app)?], 0)?;
			}

			if let Some(help) = menu
				.get(HELP_SUBMENU_ID)
				.and_then(|item| item.as_submenu().cloned())
			{
				let item = |id, text, accelerator| {
					MenuItem::with_id(app, id, text, true, accelerator)
				};
				let help_home = item(
					MENU_HELP,
					"Missionnaire Studio Help",
					Some("CmdOrCtrl+/"),
				)?;
				let getting_started = item(MENU_GETTING_STARTED, "Getting Started", None)?;
				let shortcuts = item(MENU_SHORTCUTS, "Keyboard Shortcuts", None)?;
				let troubleshooting = item(MENU_TROUBLESHOOTING, "Troubleshooting", None)?;
				let help_separator = PredefinedMenuItem::separator(app)?;
				let system_info = item(MENU_SYSTEM_INFO, "System Information", None)?;
				#[cfg(not(target_os = "macos"))]
				help.remove_at(0)?;
				help.prepend_items(
					&[
						&help_home,
						&getting_started,
						&shortcuts,
						&help_separator,
						&troubleshooting,
						&system_info,
					],
				)?;
				#[cfg(not(target_os = "macos"))]
				help.append_items(&[&PredefinedMenuItem::separator(app)?, &about])?;
			}
			Ok(menu)
		})
		.manage(Encoder::default())
		.manage(appaudio::Capture::default())
		.manage(fetch::Streams::default())
		// The media proxy. A `<video>` playing ytstream://s?id=… lands here, and
		// the answer carries the CORS header googlevideo never sends — which is
		// what keeps the program canvas untainted and capturable. Asynchronous
		// so a slow range never blocks the UI thread.
		.register_asynchronous_uri_scheme_protocol("ytstream", |ctx, request, responder| {
			let streams = ctx.app_handle().state::<fetch::Streams>();
			// The page sends a token, never an address: the proxy can only fetch
			// something this app resolved itself.
			let token = request
				.uri()
				.query()
				.and_then(|q| {
					q.split('&')
						.find_map(|pair| pair.strip_prefix("id="))
				})
				.unwrap_or_default()
				.to_string();
			let url = streams.get(&token);
			let range = request
				.headers()
				.get("range")
				.and_then(|v| v.to_str().ok())
				.map(str::to_string);

			std::thread::spawn(move || {
				let Some(url) = url else {
					responder.respond(
						tauri::http::Response::builder()
							.status(404)
							.header("Access-Control-Allow-Origin", "*")
							.body(Vec::new())
							.unwrap(),
					);
					return;
				};
				match fetch::chunk(&url, range.as_deref()) {
					Ok(part) => {
						let mut build = tauri::http::Response::builder()
							.status(part.status)
							.header("Access-Control-Allow-Origin", "*")
							.header("Content-Type", part.content_type)
							// Without this the element downloads the whole track
							// before it will let anyone scrub it.
							.header("Accept-Ranges", "bytes")
							.header("Content-Length", part.body.len().to_string());
						if let Some(range) = part.content_range {
							build = build.header("Content-Range", range);
						}
						responder.respond(build.body(part.body).unwrap());
					}
					Err(err) => {
						eprintln!("[studio] ytstream {err}");
						responder.respond(
							tauri::http::Response::builder()
								.status(502)
								.header("Access-Control-Allow-Origin", "*")
								.body(Vec::new())
								.unwrap(),
						);
					}
				}
			});
		})
		.setup(|app| {
			// Bring the window to the front on launch. Beyond being polite, a
			// window that never activates is reported as hidden by WebKit, which
			// throttles the compositor down to a frame a second.
			if let Some(window) = app.get_webview_window("main") {
				let _ = window.set_focus();
			}
			Ok(())
		})
		.plugin(tauri_plugin_dialog::init())
		.plugin(tauri_plugin_updater::Builder::new().build())
		.plugin(tauri_plugin_process::init())
		.on_menu_event(|app, event| {
			let id = event.id().as_ref();
			if matches!(
				id,
				MENU_SETTINGS
					| MENU_HELP
					| MENU_GETTING_STARTED
					| MENU_SHORTCUTS
					| MENU_TROUBLESHOOTING
					| MENU_SYSTEM_INFO
			) {
				if let Some(window) = app.get_webview_window("main") {
					let _ = window.show();
					let _ = window.set_focus();
				}
				let _ = app.emit_to("main", "studio://menu", id);
			}
		})
		.invoke_handler(tauri::generate_handler![
			check_ffmpeg,
			recording_space,
			studio_device_info,
			extract_reference_features,
			start_stream,
			studio_live_post,
			studio_youtube_post,
			studio_open_login,
			studio_open_youtube_login,
			focus_main_window,
			push_chunk,
			stop_stream,
			abort_stream,
			stream_running,
			selftest_target,
			open_url,
			open_youtube_chat,
			open_privacy_settings,
			list_audio_apps,
			list_windows,
			start_app_audio,
			stop_app_audio,
			resolve_media,
			report
		])
		.on_window_event(|window, event| {
			if window.label() != "main" {
				return;
			}
			match event {
				tauri::WindowEvent::CloseRequested { api, .. } => {
					if window
						.app_handle()
						.try_state::<Encoder>()
						.is_some_and(|encoder| encoder.is_running())
					{
						api.prevent_close();
						notify_close_blocked(window.app_handle());
					}
				}
				tauri::WindowEvent::Destroyed => {
					if let Some(encoder) = window.app_handle().try_state::<Encoder>() {
						let _ = encoder.stop();
					}
					if let Some(capture) = window.app_handle().try_state::<appaudio::Capture>() {
						capture.stop(None);
					}
				}
				_ => {}
			}
		})
		.build(tauri::generate_context!())
		.expect("error while building Missionnaire Studio")
		.run(|app, event| {
			if let tauri::RunEvent::ExitRequested { api, .. } = event {
				if app
					.try_state::<Encoder>()
					.is_some_and(|encoder| encoder.is_running())
				{
					api.prevent_exit();
					notify_close_blocked(app);
				}
			}
		});
}
