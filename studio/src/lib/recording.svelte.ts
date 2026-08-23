import { invoke } from '@tauri-apps/api/core';
import { studio } from './state.svelte';

export const recording = $state({
	cloud: false,
	error: null as string | null,
	localPath: null as string | null,
	/** Starts when the operator begins the timed programme, not at encoder boot. */
	startedAt: null as number | null
});
export const recordsLocal = () => ['local', 'both'].includes(studio.settings.recordingMode);
export const recordsCloud = () => ['cloud', 'both'].includes(studio.settings.recordingMode);

export async function startCloudRecording() {
	if (!recordsCloud() || recording.cloud) return;
	if (!studio.settings.recorderUrl.trim() || !studio.settings.recorderToken.trim()) {
		recording.error = 'Cloud recorder URL and token are required.';
		return;
	}
	try {
		await invoke('recorder_post', { baseUrl: studio.settings.recorderUrl.trim(), token: studio.settings.recorderToken.trim(), path: '/start' });
		recording.cloud = true;
		recording.startedAt ??= Date.now();
		recording.error = null;
	} catch (error) { recording.error = String(error); }
}

export async function stopCloudRecording() {
	if (!recording.cloud) return;
	try {
		await invoke('recorder_post', { baseUrl: studio.settings.recorderUrl.trim(), token: studio.settings.recorderToken.trim(), path: '/stop' });
		recording.cloud = false;
		if (!recording.localPath) recording.startedAt = null;
	} catch (error) { recording.error = String(error); }
}

export function markProgrammeRecordingStarted() {
	if (recordsLocal() || recording.cloud) recording.startedAt ??= Date.now();
}

export function clearRecording() {
	recording.localPath = null;
	recording.startedAt = null;
}
