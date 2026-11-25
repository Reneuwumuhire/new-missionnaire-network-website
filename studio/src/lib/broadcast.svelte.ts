// Program canvas + audio bus → MediaRecorder → Rust → ffmpeg → RTMP.
//
// The webview encodes to VP8/Opus and ffmpeg transcodes to H.264/AAC. That is
// one encode more than strictly necessary. For a single Missionnaire preview
// on Intel macOS, WebKit can produce fragmented H.264/AAC MP4 directly.

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { t } from './i18n.svelte';
import {
	clearRecording,
	pendingCloudRecordingStart,
	recording,
	recordsLocal,
	stopCloudRecording
} from './recording.svelte';
import {
	beginPublicRun,
	endSelectedSession,
	liveSession,
	markPublicEnding,
	refreshPublicDestinations,
	startPublicDestinations,
	studioDeviceInfo
} from './live-session.svelte';
import { destinationPlatform, destinationUrl, studio } from './state.svelte';
import { sampleOutputClock, startStreamClock, stopStreamClock } from './stream-clock';
import { captureHasStalled, retryRecovery, type CaptureState } from './stream-health';

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

export type TargetState = 'connecting' | 'reconnecting' | 'live' | 'failed';

export type StreamGroup = 'main' | 'held';

export interface TargetStatus {
	name: string;
	/** The held group starts when the operator goes live. */
	group: StreamGroup;
	missionnaire: boolean;
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
	/** True once the held publishers are running or trying to connect. */
	heldLive: false,
	starting: false,
	stopping: false,
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

function noteBroadcast(line: string) {
	broadcast.log = [...broadcast.log.slice(-199), line];
	void invoke('report', { line: `broadcast: ${line}` }).catch(() => {});
}

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
let runtime: Runtime | null = null;
let watchdog: ReturnType<typeof setInterval> | null = null;
let lastChunkAt = 0;
let recorderHasChunks = false;
let lastOutputAt = 0;
let recovering = false;
let heldTask: Promise<void> | null = null;
let publicStartTask: Promise<void> | null = null;
let lifecycle = 0;
let recoveryTimes: number[] = [];

const CAPTURE_STALL_MS = 4_000;
// WebKit can wait for a complete initial cluster before delivering any bytes.
const CAPTURE_STARTUP_STALL_MS = 15_000;
const OUTPUT_STALL_MS = 15_000;
const MAX_PENDING_CAPTURE_BYTES = 8 * 1024 * 1024;
const MAX_PENDING_CAPTURE_CHUNKS = 12;
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
	missionnaire?: boolean;
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
	feed_held: boolean;
	recording_format?: 'audio' | 'video' | 'both';
	recording_video_bitrate_kbps?: number;
	recording_audio_bitrate_kbps?: number;
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
		missionnaire: Boolean(target.missionnaire),
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
		if (!runtime || recovering || broadcast.stopping || broadcast.phase === 'idle') return;
		const state = recorder?.state ?? 'missing';
		if (
			captureHasStalled(
				state,
				lastChunkAt,
				Date.now(),
				recorderHasChunks ? CAPTURE_STALL_MS : CAPTURE_STARTUP_STALL_MS
			)
		) {
			void recoverCapture();
		} else if (recorderHasChunks && Date.now() - lastOutputAt >= OUTPUT_STALL_MS) {
			void recoverCapture('Studio capture encoder stopped advancing.');
		}
	}, 1_000);
}

function startRecorder(active: Runtime) {
	const stream = active.canvas.captureStream(active.main.fps);
	captureVideoTrack = stream.getVideoTracks()[0] ?? null;
	if (active.audioTrack) stream.addTrack(active.audioTrack);

	const current = new MediaRecorder(stream, {
		mimeType: active.mime,
		videoBitsPerSecond:
			Math.max(
				active.main.video_bitrate_kbps,
				active.main.record_local && active.main.recording_format !== 'audio'
					? (active.main.recording_video_bitrate_kbps ?? 0)
					: 0
			) * 1000,
		audioBitsPerSecond:
			Math.max(
				active.main.audio_bitrate_kbps,
				active.main.record_local ? (active.main.recording_audio_bitrate_kbps ?? 0) : 0
			) * 1000
	});
	recorder = current;
	recorderHasChunks = false;
	lastChunkAt = Date.now();
	lastOutputAt = lastChunkAt;
	const runId = active.runIds.main;
	const currentRun = () => runtime === active && active.runIds.main === runId;
	let pendingChunks = 0;
	let pendingBytes = 0;
	current.ondataavailable = ({ data }) => {
		if (data.size === 0 || recorder !== current || recovering) return;
		if (
			pendingChunks >= MAX_PENDING_CAPTURE_CHUNKS ||
			pendingBytes + data.size > MAX_PENDING_CAPTURE_BYTES
		) {
			const reason = 'Studio capture exceeded its media queue limit.';
			if (broadcast.stopping) broadcast.error = reason;
			else void recoverCapture(reason);
			return;
		}
		if (!recorderHasChunks) {
			lastOutputAt = Date.now();
			noteBroadcast(`Studio capture produced its first ${active.mime} chunk.`);
		}
		recorderHasChunks = true;
		lastChunkAt = Date.now();
		broadcast.captureState = 'healthy';
		chunks++;
		pendingChunks++;
		pendingBytes += data.size;
		chain = chain
			.then(async () => {
				if (recovering || !currentRun()) return;
				const buffer = await data.arrayBuffer();
				if (recovering || !currentRun()) return;
				await invoke('push_chunk', new Uint8Array(buffer), {
					headers: { 'x-studio-run-id': String(runId) }
				});
			})
			.catch((error) => {
				if (!currentRun()) return;
				if (broadcast.stopping) broadcast.error = String(error);
				else void recoverCapture(`Studio capture queue failed: ${String(error)}`);
			})
			.finally(() => {
				pendingChunks--;
				pendingBytes -= data.size;
			});
	};
	current.onerror = () => {
		if (recorder === current) void recoverCapture();
	};
	startStreamClock();
	// WebKit's MP4 recorder emits a fragment about once per second.
	current.start(active.main.container === 'mp4' ? 1_000 : 250);
	startWatchdog();
}

async function stopRecorder() {
	stopWatchdog();
	const current = recorder;
	if (current && current.state !== 'inactive') {
		await new Promise<void>((resolve) => {
			const finish = () => {
				clearTimeout(timeout);
				current.removeEventListener('stop', finish);
				resolve();
			};
			const incomplete = () => {
				if (broadcast.stopping) broadcast.error = 'Studio did not receive the final capture chunk.';
				finish();
			};
			const timeout = setTimeout(incomplete, 1_000);
			current.addEventListener('stop', finish, { once: true });
			try {
				current.stop();
			} catch {
				incomplete();
			}
		});
	}
	if (recorder === current) recorder = null;
	captureVideoTrack?.stop();
	captureVideoTrack = null;
	stopStreamClock();
}

async function failCapture() {
	stopWatchdog();
	await heldTask;
	await stopRecorder();
	if (runtime) runtime.runIds = {};
	await invoke('abort_stream', { group: null }).catch(() => {});
	chain = Promise.resolve();
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
	recovering = false;
	await detachListeners();
}

async function restartEncoder(
	config: StreamConfig,
	stillCurrent: () => boolean
): Promise<StartedStream | null> {
	const result = await retryRecovery(async () => {
		await invoke('abort_stream', { group: null }).catch(() => {});
		try {
			return await startEncoder('main', config);
		} catch (error) {
			noteBroadcast(`Capture encoder recovery failed: ${String(error)}`);
			throw error;
		}
	}, stillCurrent);
	if (result && !stillCurrent()) {
		await invoke('abort_stream', { group: null }).catch(() => {});
		return null;
	}
	return result;
}

async function recoverCapture(reason = 'Studio capture stalled; restarting encoder.') {
	const active = runtime;
	const generation = lifecycle;
	if (!active || recovering || broadcast.stopping || broadcast.phase === 'idle') return;
	recovering = true;
	await heldTask;
	if (generation !== lifecycle || broadcast.stopping || runtime !== active) {
		recovering = false;
		return;
	}

	const now = Date.now();
	recoveryTimes = recoveryTimes.filter((at) => now - at < RECOVERY_WINDOW_MS);
	if (recoveryTimes.length >= MAX_RECOVERIES_PER_WINDOW) {
		await failCapture();
		return;
	}
	recoveryTimes.push(now);
	broadcast.captureState = 'recovering';
	broadcast.recoveries++;
	noteBroadcast(reason);

	try {
		await stopRecorder();
		if (generation !== lifecycle || broadcast.stopping) return;
		active.runIds = {};
		await invoke('abort_stream', { group: null });
		chain = Promise.resolve();
		if (generation !== lifecycle || broadcast.stopping) return;

		const main = await restartEncoder(
			active.main,
			() => generation === lifecycle && !broadcast.stopping && runtime === active
		);
		if (!main) return;
		if (generation !== lifecycle || broadcast.stopping) {
			await invoke('abort_stream', { group: null }).catch(() => {});
			return;
		}
		active.runIds.main = main.runId;
		broadcast.command = main.command;
		broadcast.localRecordingPath = main.localRecordingPath;
		recording.localPath = main.localRecordingPath;
		broadcast.targets = [
			...statuses(active.main, 'main'),
			...(active.held
				? statuses(active.held, 'held').map((target) => ({
						...target,
						state: 'reconnecting' as const
					}))
				: [])
		];
		broadcast.stats = null;
		broadcast.phase = 'connecting';
		startRecorder(active);
		if (active.held) void startHeld(active, active.held);
	} catch (error) {
		noteBroadcast(`Capture recovery failed: ${String(error)}`);
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
	if (isStreaming() || broadcast.starting || broadcast.stopping) return;
	const generation = ++lifecycle;
	broadcast.error = null;
	broadcast.starting = true;
	broadcast.captureState = 'healthy';
	broadcast.recoveries = 0;
	recoveryTimes = [];
	chain = Promise.resolve();
	try {
		const isTest = liveSession.sessions.some(
			(session) => session._id === liveSession.selectedId && session.is_test
		);
		const destinations = studio.destinations.filter(
			(d) =>
				d.enabled &&
				!d.hold &&
				d.url.trim() &&
				(!isTest || destinationPlatform(d) === 'missionnaire')
		);
		const enabled =
			targets ??
			destinations.map((destination) => ({
				name: destination.name,
				url: destinationUrl(destination),
				missionnaire: destinationPlatform(destination) === 'missionnaire'
			}));
		const { settings } = studio;
		const recordLocal = recordsLocal();
		if (enabled.length === 0 && !recordLocal) throw new Error(t('error.noImmediateDestination'));
		const checkMissionnaireAudio = enabled.some((target) => target.missionnaire);
		let mime = pickMimeType();
		if (
			checkMissionnaireAudio &&
			enabled.length === 1 &&
			!recordLocal &&
			settings.encoder === 'hardware' &&
			heldDestinations().length === 0 &&
			typeof MediaRecorder !== 'undefined' &&
			MediaRecorder.isTypeSupported('video/mp4')
		) {
			const device = await studioDeviceInfo().catch(() => null);
			if (device?.os === 'macOS' && device.architecture === 'x86_64') mime = 'video/mp4';
		}
		if (generation !== lifecycle || broadcast.stopping) return;
		if (!mime) throw new Error(t('error.noRecorder'));

		const config: StreamConfig = {
			container: containerOf(mime),
			targets: enabled,
			fps: settings.fps,
			video_bitrate_kbps: settings.videoBitrateKbps,
			audio_bitrate_kbps: settings.audioBitrateKbps,
			encoder: settings.encoder,
			has_audio: Boolean(audioTrack),
			record_local: recordLocal,
			feed_held: heldDestinations().length > 0,
			recording_format: settings.recordingFormat,
			recording_video_bitrate_kbps: settings.recordingVideoBitrateKbps,
			recording_audio_bitrate_kbps: settings.recordingAudioBitrateKbps
		};
		runtime = {
			canvas,
			audioTrack,
			mime,
			main: config,
			runIds: {}
		};
		await attachListeners();
		if (generation !== lifecycle || broadcast.stopping) return;
		const result = await startEncoder('main', config);
		if (generation !== lifecycle || broadcast.stopping) {
			await invoke('abort_stream', { group: null }).catch(() => {});
			return;
		}
		runtime.runIds.main = result.runId;
		broadcast.command = result.command;
		broadcast.localRecordingPath = result.localRecordingPath;
		recording.localPath = result.localRecordingPath;
		broadcast.targets = statuses(config, 'main');
		chunks = 0;
		// Wait for the publisher to report delivery before enabling the next step.
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

function markPreviewLive() {
	if (broadcast.phase !== 'live') void refreshPublicDestinations();
	broadcast.phase = 'live';
	broadcast.startedAt ??= Date.now();
}

async function attachListeners() {
	await detachListeners();
	unlisteners = [
		await listen<{ group: StreamGroup; runId: number; stats: Stats }>('stream://stats', (event) => {
			const { group, runId, stats } = event.payload;
			if (runtime?.runIds[group] !== runId || broadcast.stopping) return;
			if (stats.out_time_ms > (broadcast.stats?.out_time_ms ?? 0)) lastOutputAt = Date.now();
			broadcast.stats = stats;
			sampleOutputClock(stats.out_time_ms);
			if (runtime.main.targets.length === 0 && stats.out_time_ms > 0) markPreviewLive();
		}),
		await listen<{
			group: StreamGroup;
			runId: number;
			index: number;
			state: TargetState;
			reason: string;
		}>('stream://target', (event) => {
			if (runtime?.runIds[event.payload.group] !== event.payload.runId || broadcast.stopping)
				return;
			// Target indices are local to their output group.
			const target = broadcast.targets.filter((t) => t.group === event.payload.group)[
				event.payload.index
			];
			if (!target) return;
			const wasLive = target.state === 'live';
			if (target.state !== 'reconnecting' && event.payload.state === 'reconnecting') {
				broadcast.recoveries++;
			}
			target.state = event.payload.state;
			target.reason = event.payload.reason || null;
			if (target.group === 'main') {
				const ready = broadcast.targets.some(
					(output) => output.group === 'main' && output.state === 'live'
				);
				if (ready) markPreviewLive();
				else broadcast.phase = 'connecting';
				if (wasLive !== (target.state === 'live')) void refreshPublicDestinations();
			}
		}),
		await listen<string>('stream://log', (event) => {
			broadcast.log = [...broadcast.log.slice(-199), event.payload];
		}),
		await listen<{ group: StreamGroup; runId: number; code: number; log: string[] }>(
			'stream://exited',
			(event) => {
				if (
					!isStreaming() ||
					broadcast.stopping ||
					runtime?.runIds[event.payload.group] !== event.payload.runId
				)
					return;
				void recoverCapture('Studio capture encoder exited.');
			}
		)
	];
}

async function detachListeners() {
	for (const un of unlisteners) un();
	unlisteners = [];
}

export async function stopBroadcast() {
	if (broadcast.stopping || (!isStreaming() && !broadcast.starting && !publicStartTask)) return;
	++lifecycle;
	markPublicEnding();
	broadcast.stopping = true;
	stopWatchdog();
	try {
		// Close remote sessions even if a Go Live request is still in flight.
		const recordingSession = Promise.all([publicStartTask, pendingCloudRecordingStart()]).then(
			() => {
				const { activeId, activeStartedAt } = liveSession;
				if (activeId && activeStartedAt !== null) {
					return { sessionId: activeId, sessionStartedAt: activeStartedAt };
				}
			}
		);
		await stopRecorder();
		let drainTimeout: ReturnType<typeof setTimeout> | undefined;
		await Promise.race([
			chain,
			new Promise<void>((resolve) => {
				drainTimeout = setTimeout(() => {
					broadcast.error = 'Studio timed out while queuing the final capture chunk.';
					resolve();
				}, 2_000);
			})
		]);
		clearTimeout(drainTimeout);
		await heldTask;
		const session = await recordingSession;
		// Request the drain while Studio is still sending.
		const drainingRecording = session ? stopCloudRecording(session) : undefined;
		await invoke('stop_stream', { group: null }).catch((err) => {
			broadcast.error ??= String(err);
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
		recoveryTimes = [];
		clearRecording();
		await detachListeners();
		await Promise.all([endSelectedSession(), drainingRecording ?? stopCloudRecording()]);
		if (recording.error) broadcast.error ??= recording.error;
	} finally {
		broadcast.stopping = false;
	}
}

/** Host of an ingest URL, for showing which server a destination is on
 *  without ever putting the stream key on screen. */
export function hostOf(url: string): string {
	const match = url.match(/^rtmps?:\/\/([^/:]+)/i);
	return match ? match[1] : url;
}

/** Format the encoder's byte counter. */
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

/** Held publishers subscribe to the running encoder at the next keyframe. */
function startHeld(active: Runtime, config: StreamConfig): Promise<void> {
	if (heldTask) return heldTask;
	active.held = config;
	heldTask = (async () => {
		try {
			const result = await startEncoder('held', config);
			if (runtime !== active || active.held !== config || broadcast.stopping) return;
			active.runIds.held = result.runId;
			broadcast.targets = [
				...broadcast.targets.filter((target) => target.group !== 'held'),
				...statuses(config, 'held')
			];
			broadcast.heldLive = true;
		} catch (error) {
			if (runtime !== active || active.held !== config || broadcast.stopping) return;
			delete active.held;
			for (const target of broadcast.targets) {
				if (target.group === 'held') target.state = 'failed';
			}
			broadcast.error = String(error);
		}
	})().finally(() => {
		heldTask = null;
	});
	return heldTask;
}

export async function goLiveHeld(): Promise<void> {
	const active = runtime;
	if (!active || !isStreaming() || broadcast.heldLive || broadcast.stopping) return;
	const held = heldDestinations();
	if (held.length === 0) return;
	const config: StreamConfig = {
		...active.main,
		targets: held.map((destination) => ({
			name: destination.name,
			url: destinationUrl(destination)
		})),
		record_local: false
	};
	if (recovering) {
		active.held = config;
		return;
	}
	await startHeld(active, config);
}

export async function goLivePublic(): Promise<void> {
	const session = liveSession.sessions.find((item) => item._id === liveSession.selectedId);
	if (
		!session ||
		broadcast.phase !== 'live' ||
		broadcast.publishing ||
		liveSession.publicBusy ||
		liveSession.publicRun?.ending ||
		recovering ||
		broadcast.stopping
	)
		return;
	beginPublicRun(session);
	broadcast.publishing = true;
	broadcast.error = null;
	const generation = lifecycle;
	const previewRun = runtime?.runIds.main;
	const canContinue = () =>
		generation === lifecycle &&
		previewRun === runtime?.runIds.main &&
		!recovering &&
		!broadcast.stopping;
	try {
		publicStartTask = startPublicDestinations(canContinue);
		await publicStartTask;
		if (
			!session.is_test &&
			canContinue() &&
			Object.values(liveSession.publicDestinations).some(({ status }) => status === 'live')
		) {
			await goLiveHeld();
		}
	} finally {
		publicStartTask = null;
		broadcast.publishing = false;
	}
}

/** Disconnect the held destinations, leaving the main stream running. */
export async function stopHeld(): Promise<void> {
	if (runtime) {
		delete runtime.held;
		delete runtime.runIds.held;
	}
	await heldTask;
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
