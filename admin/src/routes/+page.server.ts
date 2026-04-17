import { getDashboardStats, getRecentAuditLogs } from '../db/collections';
import { getPermissions } from '$lib/models/admin-user';
import { recorderStatus, RecorderError } from '$lib/server/recorder-client';
import { getIcecastSnapshot } from '$lib/server/icecast';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const canManageRecordings = getPermissions(locals.user).can_manage_recordings;

	const [stats, recentActivity, recorder, icecast] = await Promise.all([
		getDashboardStats(),
		getRecentAuditLogs(10),
		canManageRecordings
			? recorderStatus().catch((err: unknown) => ({
					error: err instanceof RecorderError ? err.message : (err as Error).message
				}))
			: Promise.resolve(null),
		canManageRecordings ? getIcecastSnapshot() : Promise.resolve(null)
	]);

	const liveButNotRecording = Boolean(
		canManageRecordings &&
			icecast?.sourceActive &&
			recorder &&
			'recording' in recorder &&
			!recorder.recording
	);

	return { stats, recentActivity, liveButNotRecording };
};
