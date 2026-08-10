// Program canvas + audio bus → MediaRecorder → Rust → ffmpeg → RTMP.
//
// The webview encodes to VP8/Opus and ffmpeg transcodes to H.264/AAC. That is
// one encode more than strictly necessary, but it is the only path that is the
// same on every machine: WebKit's MP4 recorder output cannot be relied on to
// be fragmented, and a half-written MP4 on a pipe is silence on air.
// ponytail: if CPU becomes the limit on the church laptop, revisit passthrough
// (`-c copy`) with the mp4 recorder and verify with a long soak test first.

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { t } from './i18n.svelte';
import { destinationUrl, studio } from './state.svelte';

const MIME_PREFERENCE = [
	'video/webm;codecs=vp8,opus',
	'video/webm;codecs=vp9,opus',
	'video/webm'
];

export interface Stats {
	frames: number;
	fps: number;
	bitrate_kbps: number;
	out_time_ms: number;
	dropped_frames: number;
	speed: number;
	total_bytes: number;
	discarded_chunks: number;
}

export type TargetState = 'connecting' | 'live' | 'failed';

export interface TargetStatus {
	name: string;
	/** Host only — shown instead of the URL so a key never lands on screen. */
	host: string;
	state: TargetState;
	reason: string | null;
	/** Recognised as a YouTube ingest, which needs its own Go Live in Studio. */
	youtube: boolean;
}

/** `idle` → `connecting` (ffmpeg up, nothing acknowledged yet) → `live` (the
 *  encoder is producing output, so we are reaching the servers). The clock
 *  starts at `live`, not at the click: that is the moment you are actually on. */
export type Phase = 'idle' | 'connecting' | 'live';

export const broadcast = $state({
	phase: 'idle' as Phase,
	starting: false,
	error: null as string | null,
	stats: null as Stats | null,
	targets: [] as TargetStatus[],
	log: [] as string[],
	/** ffmpeg command line, stream keys already redacted by the Rust side. */
	command: [] as string[],
	startedAt: null as number | null
});

/** Anything past `idle` is holding connections open and must be stopped. */
export const isStreaming = () => broadcast.phase !== 'idle';

let recorder: MediaRecorder | null = null;
let unlisteners: UnlistenFn[] = [];
// Chunks must reach ffmpeg in the order MediaRecorder produced them: a WebM
// cluster delivered out of order corrupts the stream. Tauri dispatches commands
// on a pool, so serialise here rather than hope.
let chain: Promise<unknown> = Promise.resolve();
let chunks = 0;

/** Diagnostics only: how many media chunks have been handed to ffmpeg. */
export const chunkCount = () => chunks;

export function pickMimeType(): string | null {
	if (typeof MediaRecorder === 'undefined') return null;
	return MIME_PREFERENCE.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

function containerOf(mime: string): 'webm' | 'mp4' {
	return mime.startsWith('video/mp4') ? 'mp4' : 'webm';
}

export interface Ingest {
	name: string;
	url: string;
}

/** `targets` overrides the enabled destinations — only the launch self-test
 *  passes it; normal use takes what the operator ticked. */
export async function startBroadcast(
	canvas: HTMLCanvasElement,
	audioTrack?: MediaStreamTrack,
	targets?: Ingest[]
) {
	if (isStreaming() || broadcast.starting) return;
	broadcast.error = null;
	broadcast.starting = true;
	try {
		const enabled =
			targets ??
			studio.destinations
				.filter((d) => d.enabled && d.url.trim())
				.map((d) => ({ name: d.name, url: destinationUrl(d) }));
		if (enabled.length === 0) throw new Error(t('error.noDestination'));

		const mime = pickMimeType();
		if (!mime) throw new Error(t('error.noRecorder'));

		const { settings } = studio;
		const command = await invoke<string[]>('start_stream', {
			config: {
				container: containerOf(mime),
				targets: enabled,
				fps: settings.fps,
				video_bitrate_kbps: settings.videoBitrateKbps,
				audio_bitrate_kbps: settings.audioBitrateKbps,
				encoder: settings.encoder
			}
		});
		broadcast.command = command;
		broadcast.targets = enabled.map((target) => ({
			name: target.name,
			host: hostOf(target.url),
			state: 'connecting' as TargetState,
			reason: null,
			youtube: /\byoutube\b/i.test(target.url)
		}));

		const stream = canvas.captureStream(settings.fps);
		if (audioTrack) stream.addTrack(audioTrack);

		recorder = new MediaRecorder(stream, {
			mimeType: mime,
			videoBitsPerSecond: settings.videoBitrateKbps * 1000,
			audioBitsPerSecond: settings.audioBitrateKbps * 1000
		});
		chunks = 0;
		recorder.ondataavailable = (event) => {
			if (event.data.size === 0) return;
			chunks++;
			chain = chain
				.then(() => event.data.arrayBuffer())
				.then((buffer) => invoke('push_chunk', new Uint8Array(buffer)))
				.catch((err) => {
					broadcast.error = String(err);
				});
		};
		recorder.onerror = (event) => {
			broadcast.error = t('error.encoder', { message: String((event as ErrorEvent).error ?? '?') });
			void stopBroadcast();
		};
		// 250 ms slices: small enough that a viewer's latency is dominated by the
		// CDN rather than by us, large enough that IPC overhead stays invisible.
		recorder.start(250);

		// Connecting, not live: `live` is set by the first stats frame, which is
		// ffmpeg telling us it has actually pushed something to the servers.
		broadcast.phase = 'connecting';
		broadcast.startedAt = null;
		await attachListeners();
	} catch (err) {
		broadcast.error = err instanceof Error ? err.message : String(err);
		await invoke('stop_stream').catch(() => {});
	} finally {
		broadcast.starting = false;
	}
}

async function attachListeners() {
	await detachListeners();
	unlisteners = [
		await listen<Stats>('stream://stats', (event) => {
			broadcast.stats = event.payload;
			// Output is flowing — every target that has not reported a failure is
			// connected, and this is the instant we count as on air.
			if (broadcast.phase === 'connecting' && event.payload.frames > 0) {
				broadcast.phase = 'live';
				broadcast.startedAt = Date.now();
			}
			if (broadcast.phase === 'live') {
				for (const target of broadcast.targets) {
					if (target.state === 'connecting') target.state = 'live';
				}
			}
		}),
		await listen<{ index: number; state: TargetState; reason: string }>(
			'stream://target',
			(event) => {
				const target = broadcast.targets[event.payload.index];
				if (!target) return;
				target.state = event.payload.state;
				target.reason = event.payload.reason;
			}
		),
		await listen<string>('stream://log', (event) => {
			broadcast.log = [...broadcast.log.slice(-199), event.payload];
		}),
		await listen<{ code: number; log: string[] }>('stream://exited', (event) => {
			if (!isStreaming()) return;
			// ffmpeg died on its own — never leave the UI showing "on air".
			broadcast.phase = 'idle';
			broadcast.targets = broadcast.targets.map((target) => ({ ...target, state: 'failed' }));
			broadcast.error =
				event.payload.code === 0
					? t('error.stoppedCleanly')
					: t('error.ffmpegExited', {
							code: event.payload.code,
							log: event.payload.log.slice(-3).join(' | ')
						});
			stopRecorder();
		})
	];
}

async function detachListeners() {
	for (const un of unlisteners) un();
	unlisteners = [];
}

function stopRecorder() {
	try {
		if (recorder && recorder.state !== 'inactive') recorder.stop();
	} catch {
		// Already gone.
	}
	recorder = null;
}

export async function stopBroadcast() {
	stopRecorder();
	// Let the queued chunks land before closing ffmpeg's stdin, so the last
	// second of the service is not truncated.
	await chain.catch(() => {});
	await invoke('stop_stream').catch((err) => {
		broadcast.error = String(err);
	});
	broadcast.phase = 'idle';
	broadcast.startedAt = null;
	broadcast.stats = null;
	broadcast.targets = [];
	await detachListeners();
}

/** Host of an ingest URL, for showing which server a destination is on
 *  without ever putting the stream key on screen. */
export function hostOf(url: string): string {
	const match = url.match(/^rtmps?:\/\/([^/:]+)/i);
	return match ? match[1] : url;
}

/** Bytes sent, as OBS's "total data output" reads. */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function uptimeLabel(nowMs: number): string {
	if (!broadcast.startedAt) return '00:00:00';
	const total = Math.max(0, Math.floor((nowMs - broadcast.startedAt) / 1000));
	const h = String(Math.floor(total / 3600)).padStart(2, '0');
	const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
	const s = String(total % 60).padStart(2, '0');
	return `${h}:${m}:${s}`;
}
