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
) -> Result<Vec<String>, String> {
	encoder.start(&app, config)
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
fn stop_stream(encoder: State<'_, Encoder>) -> Result<(), String> {
	encoder.stop()
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
			report
		])
		.on_window_event(|window, event| {
			// Closing the window while live would orphan ffmpeg holding the RTMP
			// connections open; YouTube would keep showing a frozen frame.
			if let tauri::WindowEvent::Destroyed = event {
				if let Some(encoder) = window.app_handle().try_state::<Encoder>() {
					let _ = encoder.stop();
				}
			}
		})
		.run(tauri::generate_context!())
		.expect("error while running Missionnaire Studio");
}
