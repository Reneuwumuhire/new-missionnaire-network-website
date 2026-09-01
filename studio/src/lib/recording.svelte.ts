import { controlCloudRecording } from './live-session.svelte';
import { studio } from './state.svelte';

export const recording = $state({
	cloud: false,
	cloudPending: false,
	error: null as string | null,
	localPath: null as string | null,
	/** Starts when the operator begins the timed programme, not at encoder boot. */
	startedAt: null as number | null
});
export const recordsLocal = () => ['local', 'both'].includes(studio.settings.recordingMode);
export const recordsCloud = () => ['cloud', 'both'].includes(studio.settings.recordingMode);

export async function startCloudRecording() {
	if (!recordsCloud() || recording.cloud || recording.cloudPending) return;
	recording.cloudPending = true;
	try {
		await controlCloudRecording('start');
		recording.cloud = true;
		recording.startedAt ??= Date.now();
		recording.error = null;
	} catch (error) {
		recording.error = String(error);
	} finally {
		recording.cloudPending = false;
	}
}

export async function stopCloudRecording() {
	if (!recording.cloud || recording.cloudPending) return;
	recording.cloudPending = true;
	try {
		await controlCloudRecording('stop');
		recording.cloud = false;
		if (!recording.localPath) recording.startedAt = null;
		recording.error = null;
	} catch (error) {
		recording.error = String(error);
	} finally {
		recording.cloudPending = false;
	}
}

export function markProgrammeRecordingStarted() {
	if (recordsLocal() || recording.cloud) recording.startedAt ??= Date.now();
}

export function clearRecording() {
	recording.localPath = null;
	recording.startedAt = null;
}
