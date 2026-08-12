// Per-application audio, captured natively and played into the mix.
//
// The engine cannot capture a window's sound (WebKit ignores audio on
// getDisplayMedia), so ScreenCaptureKit does it in Rust and posts PCM here.
// From the moment it reaches the worklet it is an ordinary source: same fader,
// same meter, monitored through the same bus, encoded through the same mix.

import { Channel, invoke } from '@tauri-apps/api/core';
import workletUrl from './pcm-worklet.js?url';
import type { Mixer } from './mixer';

export interface AudioApp {
	id: string;
	name: string;
}

export const appAudio = $state({
	/** Applications offered in the picker, refreshed when it opens. */
	apps: [] as AudioApp[],
	/** Strip ids capturing right now. Several at once, as in OBS: a window
	 *  share and an application source are separate captures. */
	capturing: [] as string[],
	error: null as string | null,
	/** False once the system has told us it cannot do this. */
	supported: true
});

export async function refreshApps(): Promise<void> {
	try {
		appAudio.apps = await invoke<AudioApp[]>('list_audio_apps');
		// An empty list on a system with no capture API is the stub's answer,
		// not an error to shout about.
		appAudio.supported = appAudio.apps.length > 0;
		appAudio.error = null;
	} catch (err) {
		appAudio.apps = [];
		appAudio.error = String(err);
	}
}

/** Guess which application a shared window belongs to, from the label the
 *  engine puts on the capture track (an app name, or a window title carrying
 *  it). A wrong guess shows on the meter and is one click to change, which
 *  beats hunting the app in a list every time a window is shared.
 *  ponytail: substring match, no fuzzy scoring — upgrade if labels get noisy. */
export function matchApp(label: string, apps: AudioApp[]): AudioApp | null {
	const haystack = label.toLowerCase();
	if (!haystack) return null;
	return (
		[...apps]
			// Longest name first, so "Google Chrome" wins over a bare "Chrome".
			.sort((a, b) => b.name.length - a.name.length)
			.find((app) => app.name.length >= 3 && haystack.includes(app.name.toLowerCase())) ?? null
	);
}

/** Sound of the whole desktop rather than one application — what a shared
 *  screen sounds like, and what OBS calls Desktop Audio. Held in the same
 *  `appId` field because from the capture on it is the same strip. */
export const DESKTOP_AUDIO = '__desktop';

export interface AudioWindow {
	appId: string;
	appName: string;
	title: string;
	width: number;
	height: number;
}

export async function listWindows(): Promise<AudioWindow[]> {
	return invoke<AudioWindow[]>('list_windows').catch(() => []);
}

/** Which window did the operator just share? The OS picker answers to the
 *  engine, not to us, so this works back from what the capture track says:
 *  its label first — a window title, or an application name — and failing
 *  that its size.
 *
 *  ponytail: the size is a last resort and only trusted when exactly one
 *  window on screen has it. A wrong guess is one click to change on the strip;
 *  no guess means the operator hunts for the app by hand every time. */
export function matchWindow(
	label: string,
	size: { width?: number; height?: number },
	windows: AudioWindow[]
): AudioWindow | null {
	const haystack = label.toLowerCase().trim();
	if (haystack) {
		// Longest first: a title wins over an app name it happens to contain.
		const byTitle = windows
			.filter((w) => w.title.length >= 3 && haystack.includes(w.title.toLowerCase()))
			.sort((a, b) => b.title.length - a.title.length)[0];
		if (byTitle) return byTitle;
		const byApp = windows
			.filter((w) => w.appName.length >= 3 && haystack.includes(w.appName.toLowerCase()))
			.sort((a, b) => b.appName.length - a.appName.length)[0];
		if (byApp) return byApp;
	}
	const { width, height } = size;
	if (!width || !height) return null;
	// The capture is in pixels and a window frame is in points, so a retina
	// share comes back at twice the size.
	const sized = windows.filter(
		(w) =>
			(w.width === width && w.height === height) ||
			(w.width * 2 === width && w.height * 2 === height)
	);
	return sized.length === 1 ? sized[0] : null;
}

const nodes = new Map<string, AudioWorkletNode>();
/** Which application each strip is actually capturing. A strip existing is not
 *  the same as it capturing the right thing: re-sharing a window points the
 *  source at another application, and without this the old capture stays put
 *  and the new one never starts. */
const capturedApp = new Map<string, string>();

/** The application a strip is capturing right now, if any. */
export const capturingApp = (sourceId: string): string | undefined => capturedApp.get(sourceId);

/** Bytes of PCM handed to the worklet — diagnostics only, but the only way to
 *  tell "capture started" from "capture is actually delivering". */
export const received = $state({ bytes: 0, blocks: 0 });

export async function startAppAudio(
	mixer: Mixer,
	sourceId: string,
	app: AudioApp
): Promise<boolean> {
	await stopAppAudio(mixer, sourceId);
	try {
		await mixer.resume();
		await mixer.ensureWorklet(workletUrl);
		const node = new AudioWorkletNode(mixer.ctx, 'pcm-source', {
			numberOfInputs: 0,
			numberOfOutputs: 1,
			outputChannelCount: [2]
		});

		const channel = new Channel<ArrayBuffer | number[]>();
		channel.onmessage = (payload) => {
			// Raw IPC bodies arrive as ArrayBuffer; a JSON fallback would be an
			// array of bytes. Handle both rather than assume.
			const bytes =
				payload instanceof ArrayBuffer ? payload : new Uint8Array(payload as number[]).buffer;
			received.bytes += bytes.byteLength;
			received.blocks++;
			node.port.postMessage(new Float32Array(bytes));
		};

		// The sentinel travels as an empty bundle id, which the native side reads
		// as "the whole display".
		await invoke('start_app_audio', {
			id: sourceId,
			bundleId: app.id === DESKTOP_AUDIO ? '' : app.id,
			channel
		});
		nodes.set(sourceId, node);
		capturedApp.set(sourceId, app.id);
		mixer.addNode(sourceId, node);
		if (!appAudio.capturing.includes(sourceId)) appAudio.capturing = [...appAudio.capturing, sourceId];
		appAudio.error = null;
		return true;
	} catch (err) {
		appAudio.error = String(err);
		return false;
	}
}

export async function stopAppAudio(mixer: Mixer, sourceId: string): Promise<void> {
	capturedApp.delete(sourceId);
	const node = nodes.get(sourceId);
	if (node) {
		node.port.onmessage = null;
		node.disconnect();
		nodes.delete(sourceId);
	}
	mixer.remove(sourceId);
	if (appAudio.capturing.includes(sourceId)) {
		appAudio.capturing = appAudio.capturing.filter((id) => id !== sourceId);
		// Only this strip's stream — the other applications keep playing.
		await invoke('stop_app_audio', { id: sourceId }).catch(() => {});
	}
}

export const isCapturing = (sourceId: string) => appAudio.capturing.includes(sourceId);
