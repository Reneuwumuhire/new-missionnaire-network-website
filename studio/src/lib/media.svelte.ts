// Live media handles, kept out of the reactive store on purpose: a MediaStream
// or an HTMLVideoElement behind a Proxy stops working in subtle ways. Everything
// here is keyed by layer id and torn down explicitly.

import { t } from './i18n.svelte';
import type { Layer } from './state.svelte';

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
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: deviceId
				? { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
				: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
			video: false
		});
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
		const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
		const h: Handle = { kind: 'screen', el: videoEl(stream), stream, error: null, objectUrl: null };
		set(layer.id, h);
		return h;
	} catch (err) {
		const h: Handle = { kind: 'screen', el: null, stream: null, error: describe(err), objectUrl: null };
		set(layer.id, h);
		return h;
	}
}

export function openFile(layer: Layer, file: File): Handle {
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
	// Muted here means "not through the speakers"; the mixer taps the element.
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
