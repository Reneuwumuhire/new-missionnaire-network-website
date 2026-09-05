import { controlCloudRecording } from './live-session.svelte';
import { studio } from './state.svelte';

export const recording = $state({
	cloud: false,
	cloudPending: false,
	error: null as string | null,
	localPath: null as string | null,
	savedId: null as string | null,
	/** Starts when the operator begins the timed programme, not at encoder boot. */
	startedAt: null as number | null
});
/** Prepared services reuse an existing sermon file. Every recorder entry point
 * checks the service type so playback and encoder startup cannot duplicate it. */
export const recordsLocal = () =>
	studio.service.type === 'live' && ['local', 'both'].includes(studio.settings.recordingMode);
export const recordsCloud = () =>
	studio.service.type === 'live' && ['cloud', 'both'].includes(studio.settings.recordingMode);

export async function startCloudRecording() {
	if (!recordsCloud() || recording.cloud || recording.cloudPending) return;
	recording.cloudPending = true;
	recording.savedId = null;
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
		const result = await controlCloudRecording('stop');
		recording.cloud = false;
		recording.savedId = result?.id ?? null;
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
