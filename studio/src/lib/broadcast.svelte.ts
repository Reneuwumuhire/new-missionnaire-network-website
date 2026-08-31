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
import { clearRecording, recording, recordsLocal, stopCloudRecording } from './recording.svelte';
import {
	endSelectedSession,
	goLiveYouTube,
	liveSession,
	sessionYouTubeChannelId,
	startSelectedSession
} from './live-session.svelte';
import { destinationUrl, requiresYouTubeGoLive, studio } from './state.svelte';
import { sampleOutputClock, startStreamClock, stopStreamClock } from './stream-clock';
import { captureHasStalled, type CaptureState } from './stream-health';

const MIME_PREFERENCE = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm'];

export interface Stats {
	frames: number;
	fps: number;
	bitrate_kbps: number;
	out_time_ms: number;
	dropped_frames: number;
	speed: number;
	total_bytes: number;
	backpressure_events: number;
}

export type TargetState = 'connecting' | 'live' | 'failed';

export type StreamGroup = 'main' | 'held';

export interface TargetStatus {
	name: string;
	/** Which encoder carries it — `held` only exists once Go Live is pressed. */
	group: StreamGroup;
	/** Host only — shown instead of the URL so a key never lands on screen. */
	host: string;
	state: TargetState;
	reason: string | null;
	/** Recognised as a YouTube ingest, which needs its own Go Live in Studio. */
	youtube: boolean;
}

/** Encoder state only. `live` means the preview signal is reaching ingest;
 * the selected public session remains closed until Go Live is pressed. */
export type Phase = 'idle' | 'connecting' | 'live';

export const broadcast = $state({
	phase: 'idle' as Phase,
	captureState: 'healthy' as CaptureState,
	recoveries: 0,
	/** True once the held destinations have their own encoder running. */
	heldLive: false,
	starting: false,
	publishing: false,
	error: null as string | null,
	stats: null as Stats | null,
	targets: [] as TargetStatus[],
	log: [] as string[],
	/** ffmpeg command line, stream keys already redacted by the Rust side. */
	command: [] as string[],
	startedAt: null as number | null,
	localRecordingPath: null as string | null
});

/** Anything past `idle` is holding connections open and must be stopped. */
export const isStreaming = () => broadcast.phase !== 'idle';

let recorder: MediaRecorder | null = null;
let captureVideoTrack: MediaStreamTrack | null = null;
let unlisteners: UnlistenFn[] = [];
// Chunks must reach ffmpeg in the order MediaRecorder produced them: a WebM
// cluster delivered out of order corrupts the stream. Tauri dispatches commands
// on a pool, so serialise here rather than hope.
let chain: Promise<unknown> = Promise.resolve();
let chunks = 0;
let hasAudio = false;
let runtime: Runtime | null = null;
let watchdog: ReturnType<typeof setInterval> | null = null;
let lastChunkAt = 0;
let recovering = false;
let stopping = false;
let lifecycle = 0;
let recoveryTimes: number[] = [];

const CAPTURE_STALL_MS = 4_000;
const RECOVERY_WINDOW_MS = 60_000;
const MAX_RECOVERIES_PER_WINDOW = 3;

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

interface StreamConfig {
	container: 'webm' | 'mp4';
	targets: Ingest[];
	fps: number;
	video_bitrate_kbps: number;
	audio_bitrate_kbps: number;
	encoder: string;
	has_audio: boolean;
	record_local: boolean;
}

interface StartedStream {
	command: string[];
	localRecordingPath: string | null;
	runId: number;
}

interface Runtime {
	canvas: HTMLCanvasElement;
	audioTrack?: MediaStreamTrack;
	mime: string;
	main: StreamConfig;
	held?: StreamConfig;
	runIds: Partial<Record<StreamGroup, number>>;
}

function statuses(config: StreamConfig, group: StreamGroup): TargetStatus[] {
	return config.targets.map((target) => ({
		name: target.name,
		host: hostOf(target.url),
		state: 'connecting',
		reason: null,
		group,
		youtube: /\byoutube\b/i.test(target.url)
	}));
}

async function startEncoder(group: StreamGroup, config: StreamConfig): Promise<StartedStream> {
	return invoke<StartedStream>('start_stream', { group, config });
}

function stopWatchdog() {
	if (watchdog) clearInterval(watchdog);
	watchdog = null;
}

function startWatchdog() {
	stopWatchdog();
	watchdog = setInterval(() => {
		if (!runtime || recovering || stopping || broadcast.phase === 'idle') return;
		const state = recorder?.state ?? 'missing';
		if (captureHasStalled(state, lastChunkAt, Date.now(), CAPTURE_STALL_MS)) {
			void recoverCapture();
		}
	}, 1_000);
}

function startRecorder(active: Runtime) {
	const stream = active.canvas.captureStream(active.main.fps);
	captureVideoTrack = stream.getVideoTracks()[0] ?? null;
	hasAudio = Boolean(active.audioTrack);
	if (active.audioTrack) stream.addTrack(active.audioTrack);

	const current = new MediaRecorder(stream, {
		mimeType: active.mime,
		videoBitsPerSecond: active.main.video_bitrate_kbps * 1000,
		audioBitsPerSecond: active.main.audio_bitrate_kbps * 1000
	});
	recorder = current;
	lastChunkAt = Date.now();
	current.ondataavailable = (event) => {
		if (event.data.size === 0 || recorder !== current) return;
		lastChunkAt = Date.now();
		if (!recovering) broadcast.captureState = 'healthy';
		chunks++;
		chain = chain
			.then(() => event.data.arrayBuffer())
			.then((buffer) => invoke('push_chunk', new Uint8Array(buffer)))
			.catch((err) => {
				broadcast.error = String(err);
			});
	};
	current.onerror = () => {
		if (recorder === current) void recoverCapture();
	};
	// 250 ms slices keep latency low without making IPC itself significant.
	startStreamClock();
	current.start(250);
	startWatchdog();
}

async function stopRecorder() {
	stopWatchdog();
	const current = recorder;
	if (current && current.state !== 'inactive') {
		await new Promise<void>((resolve) => {
			let done = false;
			const finish = () => {
				if (done) return;
				done = true;
				resolve();
			};
			current.addEventListener('stop', finish, { once: true });
			try {
				current.stop();
			} catch {
				finish();
			}
			setTimeout(finish, 1_000);
		});
	}
	if (recorder === current) recorder = null;
	captureVideoTrack?.stop();
	captureVideoTrack = null;
	stopStreamClock();
}

async function failCapture() {
	stopWatchdog();
	await stopRecorder();
	await chain.catch(() => {});
	if (runtime) runtime.runIds = {};
	await invoke('abort_stream', { group: null }).catch(() => {});
	broadcast.phase = 'idle';
	broadcast.heldLive = false;
	broadcast.captureState = 'failed';
	broadcast.stats = null;
	broadcast.startedAt = null;
	broadcast.targets = broadcast.targets.map((target) => ({ ...target, state: 'failed' }));
	broadcast.localRecordingPath = null;
	recording.localPath = null;
	if (!recording.cloud) recording.startedAt = null;
	broadcast.error = t('error.captureFailed');
	runtime = null;
	hasAudio = false;
	recovering = false;
	await detachListeners();
}

async function recoverCapture() {
	const active = runtime;
	const generation = lifecycle;
	if (!active || recovering || stopping || broadcast.phase === 'idle') return;

	const now = Date.now();
	recoveryTimes = recoveryTimes.filter((at) => now - at < RECOVERY_WINDOW_MS);
	if (recoveryTimes.length >= MAX_RECOVERIES_PER_WINDOW) {
		await failCapture();
		return;
	}
	recoveryTimes.push(now);
	recovering = true;
	broadcast.captureState = 'recovering';
	broadcast.recoveries++;
	broadcast.log = [...broadcast.log.slice(-199), 'Studio capture stalled; reconnecting encoder.'];
	void invoke('report', { line: 'capture stalled; reconnecting encoder' });

	try {
		await stopRecorder();
		await chain.catch(() => {});
		if (generation !== lifecycle || stopping) return;
		active.runIds = {};
		await invoke('abort_stream', { group: null });
		if (generation !== lifecycle || stopping) return;

		const main = await startEncoder('main', active.main);
		if (generation !== lifecycle || stopping) {
			await invoke('abort_stream', { group: null }).catch(() => {});
			return;
		}
		active.runIds.main = main.runId;
		broadcast.command = main.command;
		broadcast.localRecordingPath = main.localRecordingPath;
		recording.localPath = main.localRecordingPath;
		if (active.held) {
			const held = await startEncoder('held', active.held);
			if (generation !== lifecycle || stopping) {
				await invoke('abort_stream', { group: null }).catch(() => {});
				return;
			}
			active.runIds.held = held.runId;
		}
		broadcast.targets = [
			...statuses(active.main, 'main'),
			...(active.held ? statuses(active.held, 'held') : [])
		];
		broadcast.stats = null;
		broadcast.phase = 'connecting';
		startRecorder(active);
	} catch (error) {
		broadcast.log = [...broadcast.log.slice(-199), `Capture recovery failed: ${String(error)}`];
		await failCapture();
	} finally {
		recovering = false;
	}
}

/** `targets` overrides the enabled destinations — only the launch self-test
 *  passes it; normal use takes what the operator ticked. */
export async function startBroadcast(
	canvas: HTMLCanvasElement,
	audioTrack?: MediaStreamTrack,
	targets?: Ingest[]
) {
	if (isStreaming() || broadcast.starting) return;
	const generation = ++lifecycle;
	broadcast.error = null;
	broadcast.starting = true;
	broadcast.captureState = 'healthy';
	broadcast.recoveries = 0;
	recoveryTimes = [];
	chain = Promise.resolve();
	try {
		const enabled =
			targets ??
			studio.destinations
				.filter((d) => d.enabled && !d.hold && d.url.trim())
				.map((d) => ({ name: d.name, url: destinationUrl(d) }));
		if (enabled.length === 0 && !recordsLocal()) throw new Error(t('error.noImmediateDestination'));

		const mime = pickMimeType();
		if (!mime) throw new Error(t('error.noRecorder'));

		const { settings } = studio;
		const config: StreamConfig = {
			container: containerOf(mime),
			targets: enabled,
			fps: settings.fps,
			video_bitrate_kbps: settings.videoBitrateKbps,
			audio_bitrate_kbps: settings.audioBitrateKbps,
			encoder: settings.encoder,
			has_audio: Boolean(audioTrack),
			record_local: recordsLocal()
		};
		runtime = { canvas, audioTrack, mime, main: config, runIds: {} };
		await attachListeners();
		if (generation !== lifecycle || stopping) return;
		const result = await startEncoder('main', config);
		if (generation !== lifecycle || stopping) {
			await invoke('abort_stream', { group: null }).catch(() => {});
			return;
		}
		runtime.runIds.main = result.runId;
		broadcast.command = result.command;
		broadcast.localRecordingPath = result.localRecordingPath;
		recording.localPath = result.localRecordingPath;
		broadcast.targets = statuses(config, 'main');
		chunks = 0;
		// Connecting, not live: `live` is set by the first stats frame, which is
		// ffmpeg telling us it has actually pushed something to the servers.
		broadcast.phase = 'connecting';
		broadcast.startedAt = null;
		startRecorder(runtime);
	} catch (err) {
		broadcast.error = err instanceof Error ? err.message : String(err);
		await stopRecorder();
		await invoke('abort_stream', { group: null }).catch(() => {});
		broadcast.phase = 'idle';
		runtime = null;
		await detachListeners();
	} finally {
		broadcast.starting = false;
	}
}

async function attachListeners() {
	await detachListeners();
	unlisteners = [
		await listen<{ group: StreamGroup; runId: number; stats: Stats }>('stream://stats', (event) => {
			if (event.payload.group !== 'main' || runtime?.runIds.main !== event.payload.runId) return;
			broadcast.stats = event.payload.stats;
			sampleOutputClock(event.payload.stats.out_time_ms);
			// Output is flowing — every target that has not reported a failure is
			// connected, and this is the instant we count as on air.
			if (broadcast.phase === 'connecting' && event.payload.stats.frames > 0) {
				broadcast.phase = 'live';
				broadcast.startedAt ??= Date.now();
			}
			if (broadcast.phase === 'live') {
				for (const target of broadcast.targets) {
					// A held target is only connected once its own encoder runs.
					if (target.state !== 'connecting') continue;
					if (target.group === 'main' || broadcast.heldLive) target.state = 'live';
				}
			}
		}),
		await listen<{
			group: StreamGroup;
			runId: number;
			index: number;
			state: TargetState;
			reason: string;
		}>('stream://target', (event) => {
			if (runtime?.runIds[event.payload.group] !== event.payload.runId) return;
			// Indices are per encoder, so the group picks the list first.
			const target = broadcast.targets.filter((t) => t.group === event.payload.group)[
				event.payload.index
			];
			if (!target) return;
			target.state = event.payload.state;
			target.reason = event.payload.reason;
		}),
		await listen<string>('stream://log', (event) => {
			broadcast.log = [...broadcast.log.slice(-199), event.payload];
		}),
		await listen<{ group: StreamGroup; runId: number; code: number; log: string[] }>(
			'stream://exited',
			(event) => {
				if (
					!isStreaming() ||
					stopping ||
					runtime?.runIds[event.payload.group] !== event.payload.runId
				)
					return;
				if (event.payload.group === 'held') {
					// Losing the held encoder must not take the main stream down.
					broadcast.heldLive = false;
					for (const target of broadcast.targets) {
						if (target.group === 'held') target.state = 'failed';
					}
					return;
				}
				// An unexpected encoder exit is recoverable. Do not end the public
				// service: YouTube and Missionnaire both accept a reconnect.
				void recoverCapture();
			}
		)
	];
}

async function detachListeners() {
	for (const un of unlisteners) un();
	unlisteners = [];
}

export async function stopBroadcast() {
	++lifecycle;
	stopping = true;
	stopWatchdog();
	try {
		// Complete the public session and YouTube broadcast while the encoder still
		// has a clean signal; both remote requests are started together.
		await endSelectedSession();
		await stopRecorder();
		// Let the queued chunks land before closing ffmpeg's stdin, so the last
		// second of the service is not truncated.
		await chain.catch(() => {});
		await invoke('stop_stream', { group: null }).catch((err) => {
			broadcast.error = String(err);
		});
		broadcast.phase = 'idle';
		broadcast.heldLive = false;
		broadcast.captureState = 'healthy';
		broadcast.recoveries = 0;
		broadcast.startedAt = null;
		broadcast.stats = null;
		broadcast.targets = [];
		broadcast.localRecordingPath = null;
		runtime = null;
		hasAudio = false;
		recoveryTimes = [];
		clearRecording();
		await detachListeners();
		await stopCloudRecording();
	} finally {
		stopping = false;
	}
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

/** Held destinations that are enabled and configured. */
export function heldDestinations() {
	return studio.destinations.filter((d) => d.enabled && d.hold && d.url.trim());
}

/** Connect the held destinations. Their own ffmpeg is started and fed the same
 *  chunks, so the stream already on air is not touched — an output cannot be
 *  added to a running ffmpeg, and restarting it to add one would drop the
 *  congregation's stream to bring up a public one. */
export async function goLiveHeld(): Promise<void> {
	if (broadcast.phase !== 'live' || broadcast.heldLive || !runtime) return;
	const held = heldDestinations();
	if (held.length === 0) return;
	const mime = pickMimeType();
	if (!mime) return;

	const { settings } = studio;
	try {
		const config: StreamConfig = {
			container: containerOf(mime),
			targets: held.map((d) => ({ name: d.name, url: destinationUrl(d) })),
			fps: settings.fps,
			video_bitrate_kbps: settings.videoBitrateKbps,
			audio_bitrate_kbps: settings.audioBitrateKbps,
			encoder: settings.encoder,
			has_audio: hasAudio,
			record_local: false
		};
		const result = await startEncoder('held', config);
		runtime.held = config;
		runtime.runIds.held = result.runId;
		broadcast.targets = [...broadcast.targets, ...statuses(config, 'held')];
		broadcast.heldLive = true;
	} catch (err) {
		broadcast.error = err instanceof Error ? err.message : String(err);
	}
}

/** Open the selected Missionnaire watch page only after the operator has
 * checked the incoming signal in admin and YouTube Studio. */
export async function goLivePublic(): Promise<void> {
	if (broadcast.phase !== 'live' || broadcast.publishing || liveSession.activeId) return;
	broadcast.publishing = true;
	const session = liveSession.sessions.find((item) => item._id === liveSession.selectedId);
	const youtube =
		!session?.is_test &&
		(Boolean(session?.youtube_url) || requiresYouTubeGoLive(studio.destinations));
	broadcast.error = null;
	try {
		if (youtube) {
			const channelId = sessionYouTubeChannelId(session, liveSession.youtubeChannels);
			if (!channelId || !liveSession.youtubeChannels.some((channel) => channel.id === channelId)) {
				throw new Error(t('error.youtubeChannelMissing'));
			}
			await goLiveYouTube();
		}
		if (!(await startSelectedSession()))
			throw new Error(liveSession.error || t('error.missionnaireGoLive'));
		await goLiveHeld();
	} catch (error) {
		broadcast.error = error instanceof Error ? error.message : String(error);
	} finally {
		broadcast.publishing = false;
	}
}

/** Disconnect the held destinations, leaving the main stream running. */
export async function stopHeld(): Promise<void> {
	if (runtime) {
		delete runtime.held;
		delete runtime.runIds.held;
	}
	await invoke('stop_stream', { group: 'held' }).catch(() => {});
	broadcast.heldLive = false;
	broadcast.targets = broadcast.targets.filter((target) => target.group !== 'held');
}

export function uptimeLabel(nowMs: number): string {
	if (!broadcast.startedAt) return '00:00:00';
	const total = Math.max(0, Math.floor((nowMs - broadcast.startedAt) / 1000));
	const h = String(Math.floor(total / 3600)).padStart(2, '0');
	const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
	const s = String(total % 60).padStart(2, '0');
	return `${h}:${m}:${s}`;
}
