import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { observeAppAudio } from './appaudio.svelte';
import observerWorkletUrl from './reference-observer-worklet.js?url&no-inline';
import { hideLiveLyrics, syncLiveLyrics } from './live-session.svelte';
import { anchorAt, clearSync, followMedia, lyrics, timedPositionMs } from './lyrics.svelte';
import {
	FEATURE_DIMENSIONS,
	FEATURE_MS,
	LiveFeatureExtractor,
	MATCH_WINDOW_FRAMES,
	advancingMatch,
	type Match
} from './reference-match';

type MatchStatus = 'idle' | 'loading' | 'armed' | 'searching' | 'locked' | 'recovering' | 'error';

interface NativeReference {
	features: number[];
	frameMs: number;
	durationMs: number;
}

export const referenceMatcher = $state({
	status: 'idle' as MatchStatus,
	fileName: '',
	sourceId: null as string | null,
	sourceName: '',
	positionMs: null as number | null,
	score: null as number | null,
	error: null as string | null,
	enabled: false
});

let hasReference = false;
let extractor = new LiveFeatureExtractor();
let liveFeatures: number[] = [];
let capturedFrames = 0;
let framesSinceAttempt = 0;
let misses = 0;
let lastGood: { startFrame: number; capturedFrame: number } | null = null;
let pending: { startFrame: number; capturedFrame: number } | null = null;
let initialized = false;
let worker: Worker | null = null;
let awaitingMatch = false;
let generation = 0;
let streamContext: AudioContext | null = null;
let streamWorkletReady: Promise<void> | null = null;
let streamTap: {
	sourceId: string;
	track: MediaStreamTrack;
	source: MediaStreamAudioSourceNode;
	observer: AudioWorkletNode;
	onEnded: () => void;
} | null = null;

function resetLiveWindow() {
	extractor = new LiveFeatureExtractor();
	liveFeatures = [];
	capturedFrames = 0;
	framesSinceAttempt = 0;
	misses = 0;
	lastGood = null;
	pending = null;
	awaitingMatch = false;
	generation++;
	referenceMatcher.positionMs = null;
	referenceMatcher.score = null;
}

export function initReferenceMatcher() {
	if (initialized) return;
	initialized = true;
	worker = new Worker(new URL('./reference-worker.ts', import.meta.url), { type: 'module' });
	worker.onmessage = ({
		data
	}: MessageEvent<{
		match: Match | null;
		capturedFrame: number;
		generation: number;
	}>) => receiveMatch(data.match, data.capturedFrame, data.generation);
	worker.onerror = (event) => {
		referenceMatcher.status = 'error';
		referenceMatcher.error = event.message;
	};
	// Windows/WebView2 includes the selected display's audio in the media
	// stream. Prepare one silent tap on the first operator gesture so autoplay
	// policy cannot block it after the system picker closes.
	const wakeStreamAudio = () => {
		if (!streamContext) {
			streamContext = new AudioContext({ sampleRate: 48_000, latencyHint: 'interactive' });
			streamWorkletReady = streamContext.audioWorklet.addModule(observerWorkletUrl);
		}
		void streamContext.resume();
	};
	window.addEventListener('pointerdown', wakeStreamAudio);
	observeAppAudio((sourceId, samples) => {
		if (streamTap?.sourceId !== sourceId) feed(sourceId, samples);
	});
}

/** Feed a display-capture audio track to the matcher. WebView2 supplies this
 * on Windows; macOS supplies no track and continues through ScreenCaptureKit. */
export async function observeReferenceStream(
	sourceId: string,
	stream: MediaStream
): Promise<boolean> {
	const track = stream.getAudioTracks()[0];
	if (!track || !streamContext || !streamWorkletReady) return false;
	disconnectStreamTap();
	try {
		await streamWorkletReady;
		await streamContext.resume();
		const source = streamContext.createMediaStreamSource(new MediaStream([track]));
		const observer = new AudioWorkletNode(streamContext, 'reference-observer', {
			numberOfInputs: 1,
			numberOfOutputs: 1,
			outputChannelCount: [2]
		});
		observer.port.onmessage = ({ data }: MessageEvent<Float32Array>) => feed(sourceId, data);
		source.connect(observer);
		observer.connect(streamContext.destination);
		const onEnded = () => {
			if (streamTap?.track === track) disconnectStreamTap();
		};
		streamTap = { sourceId, track, source, observer, onEnded };
		track.addEventListener('ended', onEnded, { once: true });
		return true;
	} catch (error) {
		referenceMatcher.status = 'error';
		referenceMatcher.error = error instanceof Error ? error.message : String(error);
		return false;
	}
}

function disconnectStreamTap() {
	if (!streamTap) return;
	streamTap.track.removeEventListener('ended', streamTap.onEnded);
	streamTap.source.disconnect();
	streamTap.observer.disconnect();
	streamTap.observer.port.onmessage = null;
	streamTap = null;
}

export async function chooseReferenceAudio() {
	referenceMatcher.status = 'loading';
	referenceMatcher.error = null;
	try {
		const path = await open({
			multiple: false,
			directory: false,
			filters: [
				{ name: 'Reference audio', extensions: ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus'] }
			]
		});
		if (typeof path !== 'string') {
			referenceMatcher.status = hasReference ? 'armed' : 'idle';
			return;
		}
		const result = await invoke<NativeReference>('extract_reference_features', { path });
		if (result.frameMs !== FEATURE_MS) throw new Error('Unsupported reference timing');
		if (!worker) initReferenceMatcher();
		const features = Float32Array.from(result.features);
		worker!.postMessage({ type: 'reference', features }, [features.buffer]);
		hasReference = true;
		referenceMatcher.fileName = path.split(/[\\/]/).pop() || 'Reference audio';
		referenceMatcher.enabled = true;
		referenceMatcher.status = referenceMatcher.sourceId ? 'armed' : 'idle';
		resetLiveWindow();
	} catch (error) {
		referenceMatcher.status = 'error';
		referenceMatcher.error = error instanceof Error ? error.message : String(error);
	}
}

export function useReferenceSource(sourceId: string, sourceName: string) {
	if (referenceMatcher.sourceId !== sourceId) {
		disconnectStreamTap();
		resetLiveWindow();
	}
	referenceMatcher.sourceId = sourceId;
	referenceMatcher.sourceName = sourceName;
	referenceMatcher.enabled = true;
	referenceMatcher.status = hasReference ? 'armed' : 'idle';
}

export function resumeReferenceMatching() {
	referenceMatcher.enabled = true;
	referenceMatcher.status = hasReference && referenceMatcher.sourceId ? 'armed' : 'idle';
	resetLiveWindow();
}

export async function hideReferenceSubtitles() {
	referenceMatcher.enabled = false;
	referenceMatcher.status = 'idle';
	lyrics.onAir = false;
	clearSync();
	await hideLiveLyrics();
}

export function sermonBeginsNow() {
	if (!lyrics.srtText || lyrics.cues.length === 0) return;
	referenceMatcher.enabled = true;
	lyrics.onAir = true;
	followMedia(null);
	anchorAt(0);
	referenceMatcher.status = 'locked';
	referenceMatcher.positionMs = 0;
	void syncLiveLyrics();
}

function feed(sourceId: string, samples: Float32Array) {
	if (
		!referenceMatcher.enabled ||
		!hasReference ||
		!worker ||
		referenceMatcher.sourceId !== sourceId ||
		lyrics.mode !== 'timed' ||
		lyrics.cues.length === 0
	)
		return;
	const next = extractor.consume(samples);
	if (next.length === 0) return;
	const newFrames = next.length / FEATURE_DIMENSIONS;
	capturedFrames += newFrames;
	framesSinceAttempt += newFrames;
	liveFeatures.push(...next);
	const maximumValues = MATCH_WINDOW_FRAMES * FEATURE_DIMENSIONS;
	if (liveFeatures.length > maximumValues) {
		liveFeatures.splice(0, liveFeatures.length - maximumValues);
	}
	if (liveFeatures.length < maximumValues || framesSinceAttempt < 10 || awaitingMatch) {
		referenceMatcher.status = referenceMatcher.status === 'locked' ? 'locked' : 'searching';
		return;
	}
	framesSinceAttempt = 0;
	awaitingMatch = true;
	const live = Float32Array.from(liveFeatures);
	const expectedStart =
		referenceMatcher.status === 'locked' && misses === 0 && lastGood
			? lastGood.startFrame + capturedFrames - lastGood.capturedFrame
			: undefined;
	worker.postMessage(
		{ type: 'match', live, capturedFrame: capturedFrames, generation, expectedStart },
		[live.buffer]
	);
}

function receiveMatch(match: Match | null, matchedAtFrame: number, matchGeneration: number) {
	if (matchGeneration !== generation) return;
	awaitingMatch = false;
	if (!referenceMatcher.enabled) return;
	const candidate = match ? { startFrame: match.startFrame, capturedFrame: matchedAtFrame } : null;
	const confident = Boolean(match && match.score >= 0.76 && match.uniqueness >= 0.025);
	if (!candidate || !match || !confident) {
		pending = null;
		misses++;
		if (referenceMatcher.status === 'locked' && misses >= 5) {
			referenceMatcher.status = 'recovering';
			lyrics.onAir = false;
			clearSync();
			void hideLiveLyrics();
		}
		return;
	}

	const advancesFromGood = lastGood && advancingMatch(lastGood, candidate);
	const advancesFromPending = pending && advancingMatch(pending, candidate);
	if (!advancesFromGood && !advancesFromPending) {
		pending = candidate;
		referenceMatcher.status = referenceMatcher.status === 'locked' ? 'locked' : 'searching';
		return;
	}

	lastGood = candidate;
	pending = null;
	misses = 0;
	// A whole-sermon search runs in a worker and may finish after more audio has
	// arrived. Project the matched endpoint forward by those captured frames so
	// opening the subtitle gate does not bake search time in as subtitle lag.
	const positionMs =
		(match.startFrame + MATCH_WINDOW_FRAMES + capturedFrames - matchedAtFrame) * FEATURE_MS;
	const now = Date.now();
	followMedia(null);
	const current = timedPositionMs(now);
	referenceMatcher.positionMs = positionMs;
	referenceMatcher.score = match.score;
	referenceMatcher.status = 'locked';
	lyrics.onAir = true;
	if (current === null || Math.abs(current - positionMs) > 500) {
		anchorAt(positionMs, now);
		void syncLiveLyrics();
	}
}
