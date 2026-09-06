import { hideLiveLyrics, syncLiveLyrics, syncServiceWorkflow } from './live-session.svelte';
import { clearSync, followMedia, lyrics, nudge } from './lyrics.svelte';
import { handleFor } from './media.svelte';
import {
	markProgrammeRecordingStarted,
	recording,
	startCloudRecording,
	stopCloudRecording
} from './recording.svelte';
import { persist, studio, type ServicePhase, type ServiceType } from './state.svelte';

export const serviceRuntime = $state({
	busy: false,
	error: null as string | null,
	recordingStatus: 'idle' as 'idle' | 'recording' | 'saving' | 'saved' | 'failed'
});

const PREPARED_PHASES: ServicePhase[] = ['opening', 'sermon', 'closing'];
let bound: Array<() => void> = [];

export function nextPreparedPhase(current: ServicePhase, ended: ServicePhase): ServicePhase | null {
	if (current !== ended) return null;
	if (ended === 'opening') return 'sermon';
	if (ended === 'sermon') return 'closing';
	if (ended === 'closing') return 'complete';
	return null;
}

function element(layerId: string | null): HTMLVideoElement | null {
	const value = layerId ? handleFor(layerId)?.el : null;
	return value instanceof HTMLVideoElement ? value : null;
}

function setPhase(phase: ServicePhase) {
	studio.service.phase = phase;
	applyRouting();
	persist();
	void syncServiceWorkflow();
}

/** The routing policy is role based and reapplied on every phase change. A
 * scene transition or reconnected handle cannot make Krefeld audible in the
 * prepared workflow because the serialised source itself remains muted. */
export function applyRouting() {
	const service = studio.service;
	const activeLayerId =
		service.phase === 'opening'
			? service.openingLayerId
			: service.phase === 'sermon'
				? service.sermonLayerId
				: service.phase === 'closing'
					? service.closingLayerId
					: null;
	const scenes = studio.programSceneSnapshot
		? [...studio.scenes, studio.programSceneSnapshot]
		: studio.scenes;
	for (const scene of scenes) {
		for (const layer of scene.layers) {
			if (
				[service.openingLayerId, service.sermonLayerId, service.closingLayerId].includes(layer.id)
			) {
				layer.muted = service.type !== 'prepared' || layer.id !== activeLayerId;
			}
			if (layer.id === service.krefeldLayerId) {
				layer.muted = service.type === 'prepared';
				if (service.type === 'live') layer.gain = service.phase === 'sermon' ? 0.2 : 1;
			}
		}
	}
	for (const source of studio.audioSources) {
		if (source.serviceRole === 'interpreter')
			source.muted = service.type !== 'live' || service.phase !== 'sermon';
		if (source.serviceRole === 'krefeld') {
			source.muted = service.type === 'prepared';
			if (service.type === 'live') source.gain = service.phase === 'sermon' ? 0.2 : 1;
		}
	}
}

export function selectServiceType(type: ServiceType) {
	if (studio.service.phase !== 'ready' && studio.service.phase !== 'complete') return;
	studio.service.type = type;
	studio.service.phase = 'ready';
	studio.service.sermonStartedAt = null;
	studio.service.sermonEndedAt = null;
	studio.service.markerCorrectionMs = 0;
	serviceRuntime.error = null;
	serviceRuntime.recordingStatus = 'idle';
	// Live interpretation always has a local safety capture at minimum.
	if (type === 'live' && studio.settings.recordingMode === 'off')
		studio.settings.recordingMode = 'both';
	lyrics.onAir = false;
	applyRouting();
	persist();
}

export function preparedReady(): string[] {
	const service = studio.service;
	const missing: string[] = [];
	if (!element(service.openingLayerId)) missing.push('opening music');
	if (!element(service.sermonLayerId)) missing.push('Kinyarwanda sermon');
	if (!element(service.closingLayerId)) missing.push('closing music');
	if (!service.subtitleFileName || lyrics.cues.length === 0) missing.push('sermon subtitles');
	return missing;
}

export function liveReady(): string[] {
	const missing: string[] = [];
	if (!studio.service.krefeldLayerId || !handleFor(studio.service.krefeldLayerId)) {
		missing.push('connected continuous Krefeld source');
	}
	if (!studio.service.subtitleFileName || lyrics.cues.length === 0)
		missing.push('sermon subtitles');
	const interpreter = studio.audioSources.find((source) => source.serviceRole === 'interpreter');
	if (!interpreter) {
		missing.push('interpreter microphone');
	} else if (!handleFor(interpreter.id)?.stream) {
		missing.push('connected interpreter microphone');
	}
	if (!studio.settings.interpreterOutputDeviceId) missing.push('interpreter headphone output');
	if (studio.settings.recordingMode === 'off') missing.push('recording destination');
	return missing;
}

export async function startPreparedProgramme() {
	if (serviceRuntime.busy || studio.service.type !== 'prepared' || studio.service.phase !== 'ready')
		return;
	const missing = preparedReady();
	if (missing.length) {
		serviceRuntime.error = `Locate or load: ${missing.join(', ')}.`;
		return;
	}
	serviceRuntime.busy = true;
	serviceRuntime.error = null;
	try {
		lyrics.onAir = false;
		clearSync();
		setPhase('opening');
		const opening = element(studio.service.openingLayerId)!;
		opening.currentTime = 0;
		element(studio.service.sermonLayerId)!.preload = 'auto';
		await opening.play();
	} catch (error) {
		setPhase('ready');
		serviceRuntime.error = String(error);
	} finally {
		serviceRuntime.busy = false;
	}
}

async function advancePrepared(from: ServicePhase) {
	if (
		serviceRuntime.busy ||
		studio.service.type !== 'prepared' ||
		!nextPreparedPhase(studio.service.phase, from)
	)
		return;
	serviceRuntime.busy = true;
	try {
		if (from === 'opening') {
			setPhase('sermon');
			const sermon = element(studio.service.sermonLayerId)!;
			sermon.currentTime = 0;
			followMedia(studio.service.sermonLayerId);
			lyrics.onAir = true;
			element(studio.service.closingLayerId)!.preload = 'auto';
			await sermon.play();
			void syncLiveLyrics();
		} else if (from === 'sermon') {
			lyrics.onAir = false;
			clearSync();
			void hideLiveLyrics();
			setPhase('closing');
			const closing = element(studio.service.closingLayerId)!;
			closing.currentTime = 0;
			await closing.play();
		} else if (from === 'closing') {
			setPhase('complete');
		}
	} catch (error) {
		serviceRuntime.error = `Programme stopped: ${String(error)}`;
	} finally {
		serviceRuntime.busy = false;
	}
}

/** Rebind after a file is located. Only a natural `ended` event advances; play,
 * pause, seek, stalled and error events deliberately do not. */
export function bindPreparedQueue() {
	for (const release of bound) release();
	bound = [];
	for (const [index, layerId] of [
		studio.service.openingLayerId,
		studio.service.sermonLayerId,
		studio.service.closingLayerId
	].entries()) {
		const media = element(layerId);
		if (!media) continue;
		const phase = PREPARED_PHASES[index];
		const ended = () => void advancePrepared(phase);
		const failed = () => {
			if (studio.service.type === 'prepared' && studio.service.phase === phase) {
				serviceRuntime.error = `${phase} media failed. Locate the file or use recovery controls.`;
			}
		};
		media.addEventListener('ended', ended);
		media.addEventListener('error', failed);
		bound.push(() => {
			media.removeEventListener('ended', ended);
			media.removeEventListener('error', failed);
		});
	}
}

export async function takeKrefeldLive() {
	if (serviceRuntime.busy || studio.service.type !== 'live' || studio.service.phase !== 'ready')
		return;
	if (!studio.service.krefeldLayerId) {
		serviceRuntime.error = 'Choose the continuous Krefeld source.';
		return;
	}
	setPhase('opening');
	serviceRuntime.error = null;
	const media = element(studio.service.krefeldLayerId);
	if (media?.paused) await media.play().catch((error) => (serviceRuntime.error = String(error)));
}

export async function startLiveSermon(outputMediaMs: number) {
	if (
		serviceRuntime.busy ||
		studio.service.type !== 'live' ||
		!['ready', 'opening'].includes(studio.service.phase)
	)
		return;
	const missing = liveReady();
	if (missing.length) {
		serviceRuntime.error = `Prepare: ${missing.join(', ')}.`;
		return;
	}
	serviceRuntime.busy = true;
	serviceRuntime.error = null;
	setPhase('sermon');
	studio.service.markerCorrectionMs = 0;
	studio.service.sermonStartedAt = Math.max(0, Math.round(outputMediaMs));
	void syncServiceWorkflow();
	serviceRuntime.recordingStatus = 'recording';
	try {
		// Recording is intentionally first: caption failure must never lose audio.
		markProgrammeRecordingStarted();
		await startCloudRecording();
		if (recording.error && !recording.localPath) {
			serviceRuntime.recordingStatus = 'failed';
			serviceRuntime.error = `Recording failed: ${recording.error}`;
		}
		lyrics.onAir = true;
		clearSync();
		lyrics.anchorEpochMs = Date.now();
		void syncLiveLyrics();
	} finally {
		serviceRuntime.busy = false;
		persist();
	}
}

export async function endLiveSermon(outputMediaMs: number) {
	if (serviceRuntime.busy || studio.service.type !== 'live' || studio.service.phase !== 'sermon')
		return;
	serviceRuntime.busy = true;
	studio.service.sermonEndedAt = Math.max(0, Math.round(outputMediaMs));
	lyrics.onAir = false;
	clearSync();
	void hideLiveLyrics();
	setPhase('closing');
	serviceRuntime.recordingStatus = 'saving';
	try {
		await stopCloudRecording();
		serviceRuntime.recordingStatus = recording.error ? 'failed' : 'saved';
		if (recording.error) serviceRuntime.error = `Recording save failed: ${recording.error}`;
	} finally {
		serviceRuntime.busy = false;
		persist();
	}
}

export function correctLiveTiming(deltaMs: number) {
	if (studio.service.type !== 'live' || studio.service.phase !== 'sermon') return;
	studio.service.markerCorrectionMs = Math.max(
		-30_000,
		Math.min(30_000, studio.service.markerCorrectionMs + deltaMs)
	);
	nudge(deltaMs);
	persist();
	void syncServiceWorkflow();
}

export async function retryLiveRecording() {
	if (studio.service.type !== 'live' || studio.service.phase !== 'sermon' || serviceRuntime.busy)
		return;
	serviceRuntime.busy = true;
	await startCloudRecording();
	serviceRuntime.recordingStatus = recording.error ? 'failed' : 'recording';
	serviceRuntime.error = recording.error ? `Recording failed: ${recording.error}` : null;
	serviceRuntime.busy = false;
}

export function resetService() {
	for (const id of [
		studio.service.openingLayerId,
		studio.service.sermonLayerId,
		studio.service.closingLayerId
	]) {
		const media = element(id);
		media?.pause();
	}
	studio.service.phase = 'ready';
	studio.service.sermonStartedAt = null;
	studio.service.sermonEndedAt = null;
	studio.service.markerCorrectionMs = 0;
	lyrics.onAir = false;
	clearSync();
	serviceRuntime.error = null;
	serviceRuntime.recordingStatus = 'idle';
	applyRouting();
	persist();
}
