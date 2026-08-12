// Live media handles, kept out of the reactive store on purpose: a MediaStream
// or an HTMLVideoElement behind a Proxy stops working in subtle ways. Everything
// here is keyed by layer id and torn down explicitly.

import { invoke } from '@tauri-apps/api/core';
import { t } from './i18n.svelte';
import { MIX_RATE } from './mixer';
import type { Layer } from './state.svelte';

/** Print to the terminal the studio was launched from. A packaged .app has no
 *  console anyone can reach, and a silent failure at 9 on a Sunday morning is
 *  worth a line of stdout. */
export const report = (line: string) => void invoke('report', { line }).catch(() => {});

/** Whether the operator has let us near the devices. macOS only records an
 *  application in Privacy & Security once it has actually asked, which is why
 *  the studio asks on launch instead of waiting for the first source. */
export const permissions = $state({
	microphone: 'unknown' as 'unknown' | 'granted' | 'denied',
	message: ''
});

/** Ask for the microphone, once, and let it go again. The stream is not what
 *  we are after — the grant is: until it exists the engine reports no input
 *  devices at all, so the mixer has an empty device menu and no way to explain
 *  why. Cameras and screen sharing ask for themselves when a source is added. */
export async function askForMicrophone(): Promise<void> {
	try {
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		stream.getTracks().forEach((track) => track.stop());
		permissions.microphone = 'granted';
		permissions.message = '';
	} catch (err) {
		permissions.microphone = 'denied';
		permissions.message = describe(err);
	}
}

/** Open the macOS pane where the answer can be changed — a refusal is not
 *  recoverable from inside the app, so pointing at it is all we can do. */
export function openPrivacySettings(pane: 'microphone' | 'camera' | 'screen'): void {
	void invoke('open_privacy_settings', { pane }).catch(() => {});
}

export interface Handle {
	kind: Layer['kind'];
	/** What the compositor draws. */
	el: HTMLVideoElement | HTMLImageElement | null;
	stream: MediaStream | null;
	/** Set when the source failed, shown on the layer row instead of silence. */
	error: string | null;
	objectUrl: string | null;
}

const handles = new Map<string, Handle>();
/** Bumped every time a handle appears or fails, so Svelte can re-read. */
export const mediaVersion = $state({ n: 0 });

export function handleFor(layerId: string): Handle | undefined {
	return handles.get(layerId);
}

function set(layerId: string, handle: Handle) {
	handles.set(layerId, handle);
	mediaVersion.n++;
}

export function release(layerId: string) {
	const h = handles.get(layerId);
	if (!h) return;
	h.stream?.getTracks().forEach((t) => t.stop());
	if (h.el instanceof HTMLVideoElement) {
		h.el.pause();
		h.el.srcObject = null;
		h.el.removeAttribute('src');
	}
	if (h.objectUrl) URL.revokeObjectURL(h.objectUrl);
	handles.delete(layerId);
	mediaVersion.n++;
}

export function releaseAll() {
	for (const key of [...handles.keys()]) release(key);
}

function videoEl(stream: MediaStream): HTMLVideoElement {
	const el = document.createElement('video');
	el.srcObject = stream;
	el.muted = true; // audio goes through the mixer, never straight to speakers
	el.playsInline = true;
	el.autoplay = true;
	void el.play().catch(() => {});
	return el;
}

export async function openCamera(layer: Layer, width: number, height: number): Promise<Handle> {
	release(layer.id);
	try {
		const stream = await navigator.mediaDevices.getUserMedia({
			video: layer.deviceId
				? { deviceId: { exact: layer.deviceId }, width, height }
				: { width, height },
			// Audio comes from the mic layer, not bundled with the camera, so the
			// operator can mix them independently.
			audio: false
		});
		const h: Handle = { kind: 'camera', el: videoEl(stream), stream, error: null, objectUrl: null };
		set(layer.id, h);
		return h;
	} catch (err) {
		const h: Handle = { kind: 'camera', el: null, stream: null, error: describe(err), objectUrl: null };
		set(layer.id, h);
		return h;
	}
}

/** Microphone / any audio input. No picture, so no element — the mixer takes
 *  the stream directly. */
export async function openMic(layerId: string, deviceId?: string): Promise<Handle> {
	release(layerId);
	try {
		// The processing is off because this is a broadcast desk, not a phone
		// call: the operator rides the level, and gates chewing the front of a
		// word cannot be undone downstream.
		//
		// The rate is asked for because the mixer runs at 48 kHz for the native
		// app capture, and WebKit does not resample a stream into a context with
		// a different rate — it plays silence. A device that cannot do 48 kHz
		// ignores this and is reported below.
		// The channel count is deliberately not asked for. A mono device handed
		// a request for two gives back a node that claims stereo and carries
		// silence on the right, which meters as a dead leg and puts the preacher
		// on one side of the stream. Left alone it reports one channel, and the
		// mixer duplicates it properly.
		const shared = {
			echoCancellation: false,
			noiseSuppression: false,
			autoGainControl: false,
			sampleRate: MIX_RATE
		};
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: deviceId ? { deviceId: { exact: deviceId }, ...shared } : shared,
			video: false
		});
		const rate = stream.getAudioTracks()[0]?.getSettings().sampleRate;
		if (rate && rate !== MIX_RATE) {
			// Nothing to be done from here, but a flat meter with no explanation
			// is the worst possible half hour before a service.
			report(`input device runs at ${rate} Hz, mixer at ${MIX_RATE} Hz — WebKit may deliver silence`);
		}
		const h: Handle = { kind: 'camera', el: null, stream, error: null, objectUrl: null };
		set(layerId, h);
		return h;
	} catch (err) {
		const h: Handle = { kind: 'camera', el: null, stream: null, error: describe(err), objectUrl: null };
		set(layerId, h);
		return h;
	}
}

export async function openScreen(layer: Layer): Promise<Handle> {
	release(layer.id);
	try {
		// The picker is the OS one — which window/screen is the operator's call,
		// so there is nothing for us to configure here.
		//
		// `audio` is asked for and WebKit ignores it: it does not implement audio
		// capture of the shared surface, and returns video only without an error.
		// So on macOS a shared tab arrives silent no matter what — the mixer says
		// so and points at the way round it. Chromium (the Windows webview) does
		// honour this, which is why it is still requested.
		// ponytail: real per-app audio needs ScreenCaptureKit on the Rust side.
		const stream = await navigator.mediaDevices.getDisplayMedia({
			video: cursorConstraint(layer),
			audio: true
		});
		const h: Handle = { kind: 'screen', el: videoEl(stream), stream, error: null, objectUrl: null };
		set(layer.id, h);
		return h;
	} catch (err) {
		const h: Handle = { kind: 'screen', el: null, stream: null, error: describe(err), objectUrl: null };
		set(layer.id, h);
		return h;
	}
}

/** The pointer is painted into the shared frame by the OS, so leaving it out
 *  can only be asked for, never done here. `cursor` is the constraint for it. */
type CursorConstraints = MediaTrackConstraints & { cursor?: 'always' | 'motion' | 'never' };

function cursorConstraint(layer: Layer): CursorConstraints {
	return { cursor: layer.hideCursor ? 'never' : 'always' };
}

/** Whether this engine admits to understanding the cursor constraint. WebKit
 *  does not, and keeps drawing the pointer whatever is asked — the UI says so
 *  rather than offering a switch that quietly does nothing. */
export const canHideCursor = (): boolean =>
	'cursor' in navigator.mediaDevices.getSupportedConstraints();

/** Apply the choice to a share already running, so the toggle does not wait
 *  for a reconnect and a second trip through the OS picker. */
export async function applyCursor(layer: Layer): Promise<void> {
	const track = handleFor(layer.id)?.stream?.getVideoTracks()[0];
	// An engine that ignores the constraint also rejects it here; the setting
	// is kept either way and applied to the next share.
	await track?.applyConstraints(cursorConstraint(layer)).catch(() => {});
}

/** A seek target that a media element will actually accept: never before the
 *  start, never past the end, and never NaN — the duration is unknown until the
 *  file's metadata has loaded, and setting currentTime to NaN throws. */
export function clampTime(seconds: number, duration: number): number {
	if (!Number.isFinite(seconds)) return 0;
	const end = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
	return Math.max(0, Math.min(seconds, end));
}

/** `Blob`, not `File`: a download fetched by the Rust side arrives as bytes and
 *  becomes a blob here. Same object URL, same element, same everything after —
 *  and a blob is same-origin, which is what keeps the program canvas untainted. */
export function openFile(layer: Layer, file: Blob): Handle {
	release(layer.id);
	const url = URL.createObjectURL(file);
	if (layer.kind === 'image') {
		const el = new Image();
		el.src = url;
		const h: Handle = { kind: 'image', el, stream: null, error: null, objectUrl: url };
		el.onerror = () => {
			h.error = t('source.badImage');
			mediaVersion.n++;
		};
		el.onload = () => mediaVersion.n++;
		set(layer.id, h);
		return h;
	}
	const el = document.createElement('video');
	el.src = url;
	el.loop = false;
	el.playsInline = true;
	// Muted only until the mixer taps it. Muting is applied before the element
	// reaches a MediaElementAudioSourceNode, so a muted element feeds the mix
	// silence — the recording played, the meter never moved and nothing went to
	// air. The tap is what keeps it out of the speakers, and Mixer.addElement
	// unmutes as it takes the signal.
	el.muted = true;
	const h: Handle = { kind: 'video', el, stream: null, error: null, objectUrl: url };
	el.onerror = () => {
		h.error = t('source.badVideo');
		mediaVersion.n++;
	};
	el.onloadedmetadata = () => mediaVersion.n++;
	set(layer.id, h);
	return h;
}

function describe(err: unknown): string {
	if (!(err instanceof Error)) return String(err);
	switch (err.name) {
		case 'NotAllowedError':
			return t('source.denied');
		case 'NotFoundError':
			return t('source.notFound');
		case 'NotReadableError':
			return t('source.busy');
		case 'OverconstrainedError':
			return t('source.overconstrained');
		default:
			return err.message || err.name;
	}
}

export interface DeviceOption {
	deviceId: string;
	label: string;
}

/** Labels only appear once permission has been granted, so this is called
 *  again after the first successful capture. */
export async function listDevices(kind: 'videoinput' | 'audioinput'): Promise<DeviceOption[]> {
	try {
		const devices = await navigator.mediaDevices.enumerateDevices();
		return devices
			.filter((d) => d.kind === kind)
			.map((d, i) => ({ deviceId: d.deviceId, label: d.label || `#${i + 1}` }));
	} catch {
		return [];
	}
}
