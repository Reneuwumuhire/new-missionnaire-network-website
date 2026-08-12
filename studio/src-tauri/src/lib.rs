mod appaudio;
mod fetch;
mod ffmpeg;

use ffmpeg::{Encoder, FfmpegInfo, StreamConfig};
use tauri::{AppHandle, Manager, State};

#[tauri::command]
fn check_ffmpeg() -> Result<FfmpegInfo, String> {
	ffmpeg::probe_ffmpeg()
}

/// Returns the ffmpeg command line with stream keys redacted, so the UI can
/// show exactly what is running without leaking secrets into a screenshot.
#[tauri::command]
fn start_stream(
	app: AppHandle,
	encoder: State<'_, Encoder>,
	config: StreamConfig,
	group: String,
) -> Result<Vec<String>, String> {
	encoder.start(&app, config, &group)
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
	if !url.starts_with("https://") || url.len() > 2048 {
		return Err("URL non supportée".into());
	}
	if url.chars().any(|c| c.is_control() || c.is_whitespace()) {
		return Err("URL invalide".into());
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

/// What a URL is, before committing to downloading it. Cheap, and it tells the
/// operator the title they are about to add.
#[tauri::command]
async fn probe_media(url: String) -> Result<fetch::Fetched, String> {
	tauri::async_runtime::spawn_blocking(move || fetch::probe(&url))
		.await
		.map_err(|e| e.to_string())?
}

/// Download a URL and hand back the file itself. Raw bytes rather than a path:
/// the webview turns them into a blob, which is same-origin and so can be drawn
/// onto the program canvas without tainting it. See fetch.rs for why that
/// matters.
#[tauri::command]
async fn fetch_media(
	app: AppHandle,
	url: String,
	audio_only: bool,
) -> Result<tauri::ipc::Response, String> {
	// spawn_blocking, not the async pool: this runs a subprocess to completion
	// and would otherwise hold a runtime thread for the length of a download.
	let bytes = tauri::async_runtime::spawn_blocking(move || fetch::fetch(&app, &url, audio_only))
		.await
		.map_err(|e| e.to_string())??;
	Ok(tauri::ipc::Response::new(bytes))
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
		.manage(Encoder::default())
		.manage(appaudio::Capture::default())
		.setup(|app| {
			// Bring the window to the front on launch. Beyond being polite, a
			// window that never activates is reported as hidden by WebKit, which
			// throttles the compositor down to a frame a second.
			if let Some(window) = app.get_webview_window("main") {
				let _ = window.set_focus();
			}
			Ok(())
		})
		.invoke_handler(tauri::generate_handler![
			check_ffmpeg,
			start_stream,
			push_chunk,
			stop_stream,
			stream_running,
			selftest_target,
			open_url,
			open_privacy_settings,
			list_audio_apps,
			list_windows,
			start_app_audio,
			stop_app_audio,
			probe_media,
			fetch_media,
			report
		])
		.on_window_event(|window, event| {
			// Closing the window while live would orphan ffmpeg holding the RTMP
			// connections open; YouTube would keep showing a frozen frame.
			if let tauri::WindowEvent::Destroyed = event {
				if let Some(encoder) = window.app_handle().try_state::<Encoder>() {
					let _ = encoder.stop();
				}
				if let Some(capture) = window.app_handle().try_state::<appaudio::Capture>() {
					capture.stop(None);
				}
			}
		})
		.run(tauri::generate_context!())
		.expect("error while running Missionnaire Studio");
}
