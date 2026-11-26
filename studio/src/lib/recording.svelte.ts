import { controlCloudRecording, liveSession, type RecordingSession } from './live-session.svelte';
import { studio } from './state.svelte';

export const recording = $state({
	cloud: false,
	cloudPending: false,
	error: null as string | null,
	localPath: null as string | null,
	savedId: null as string | null,
	serviceId: null as string | null,
	/** Starts when the operator begins the timed programme, not at encoder boot. */
	startedAt: null as number | null
});
/** Prepared services reuse an existing sermon file. Every recorder entry point
 * checks the service type so playback and encoder startup cannot duplicate it. */
export const recordsLocal = () =>
	studio.service.type === 'live' && ['local', 'both'].includes(studio.settings.recordingMode);
export const recordsCloud = () =>
	studio.service.type === 'live' && ['cloud', 'both'].includes(studio.settings.recordingMode);

let cloudStart: Promise<void> | null = null;
let cloudStop: Promise<void> | null = null;
let cloudSession: RecordingSession | undefined;

export function pendingCloudRecordingStart() {
	return cloudStart;
}

export function cloudRecordingSession() {
	return cloudSession;
}

export async function startCloudRecording(manual = false) {
	if (
		(!manual && !recordsCloud()) ||
		liveSession.publicRun?.ending ||
		recording.cloud ||
		recording.cloudPending
	)
		return;
	recording.cloudPending = true;
	recording.savedId = null;
	const { activeId, activeStartedAt } = liveSession;
	const session =
		activeId && activeStartedAt !== null
			? { sessionId: activeId, sessionStartedAt: activeStartedAt }
			: undefined;
	cloudStart = controlCloudRecording('start', session)
		.then((result) => {
			recording.serviceId = activeId;
			if (result?.stopped) {
				recording.savedId = result.id;
				return;
			}
			recording.cloud = true;
			cloudSession = session;
			recording.startedAt ??= Date.now();
			recording.error = null;
		})
		.catch((error) => {
			recording.error = String(error);
		})
		.finally(() => {
			recording.cloudPending = false;
			cloudStart = null;
		});
	await cloudStart;
}

export function stopCloudRecording(session?: RecordingSession) {
	if (cloudStop) return cloudStop;
	if ((!session && !recording.cloud) || recording.cloudPending) return;
	recording.cloudPending = true;
	cloudStop = controlCloudRecording('stop', session)
		.then((result) => {
			recording.cloud = false;
			cloudSession = undefined;
			recording.savedId = result?.id ?? recording.savedId;
			if (result?.id && session) recording.serviceId = session.sessionId;
			if (!recording.localPath) recording.startedAt = null;
			recording.error =
				session && result?.id && result.tailComplete !== true
					? 'The cloud recorder could not confirm the ending.'
					: null;
		})
		.catch((error) => {
			const message = String(error);
			recording.error = /Route POST:\/stop\/[^/]+\/drain not found/.test(message)
				? 'The cloud recorder is still running. Stop it from Admin → Recordings.'
				: message;
		})
		.finally(() => {
			recording.cloudPending = false;
			cloudStop = null;
		});
	return cloudStop;
}

export function markProgrammeRecordingStarted() {
	if (recordsLocal() || recording.cloud) recording.startedAt ??= Date.now();
}

export function clearRecording() {
	recording.localPath = null;
	recording.startedAt = null;
}
