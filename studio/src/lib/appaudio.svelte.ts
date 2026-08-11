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
	/** Source id currently capturing — the native side does one at a time. */
	capturing: null as string | null,
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

const nodes = new Map<string, AudioWorkletNode>();

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

		await invoke('start_app_audio', { bundleId: app.id, channel });
		nodes.set(sourceId, node);
		mixer.addNode(sourceId, node);
		appAudio.capturing = sourceId;
		appAudio.error = null;
		return true;
	} catch (err) {
		appAudio.error = String(err);
		appAudio.capturing = null;
		return false;
	}
}

export async function stopAppAudio(mixer: Mixer, sourceId: string): Promise<void> {
	const node = nodes.get(sourceId);
	if (node) {
		node.port.onmessage = null;
		node.disconnect();
		nodes.delete(sourceId);
	}
	mixer.remove(sourceId);
	if (appAudio.capturing === sourceId) {
		appAudio.capturing = null;
		await invoke('stop_app_audio').catch(() => {});
	}
}

export const isCapturing = (sourceId: string) => appAudio.capturing === sourceId;
