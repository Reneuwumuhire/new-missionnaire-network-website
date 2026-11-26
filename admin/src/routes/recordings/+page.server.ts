import { verifyAdminSession } from '$lib/server/admin-session';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import {
	listRecordings,
	listScheduledLives,
	getScheduledLiveById,
	getRecordingById,
	setScheduledLiveRecordingId,
	logAudit,
	getBroadcastAdminState,
	countPushSubscriptions
} from '../../db/collections';
import { RecorderError, recorderStatus, type RecorderStatus } from '$lib/server/recorder-client';
import { getIcecastSnapshot, icecastStreamUrl, liveAudioHlsUrl } from '$lib/server/icecast';

export const load: PageServerLoad = async ({ cookies, url }) => {
	const adminUser = await verifyAdminSession(cookies);
	if (!getPermissions(adminUser).can_manage_recordings) throw error(403, 'Accès refusé');

	// Initial paint just shows the 5 most recent recordings — the rest are
	// fetched on demand via /api/recordings/list (search / load more). The
	// list is STREAMED (not awaited) so the control center renders with
	// skeleton rows while MongoDB works; the page resolves it in onMount.
	const serviceId = url.searchParams.get('service');
	const service = serviceId ? await getScheduledLiveById(serviceId) : null;
	if (serviceId && !service) throw error(404, 'Service not found');
	const recordingId = service
		? (service.recording_id ?? undefined)
		: url.searchParams.get('recording') || undefined;
	const initialStatus: 'failed' | 'all' =
		url.searchParams.get('status') === 'failed' ? 'failed' : 'all';
	const list =
		service && !recordingId
			? Promise.resolve({ data: [], total: 0 })
			: listRecordings({
					limit: 5,
					recordingId,
					status: initialStatus === 'failed' ? initialStatus : undefined
				});
	list.catch(() => {});

	const [statusResult, icecast, broadcast, subscriberCount, upcomingLives, pastLives] =
		await Promise.all([
			recorderStatus().catch((err: unknown) => {
				const message = err instanceof RecorderError ? err.message : (err as Error).message;
				return { error: message } as const;
			}),
			getIcecastSnapshot(),
			getBroadcastAdminState(),
			countPushSubscriptions().catch(() => 0),
			listScheduledLives({ statuses: ['scheduled', 'live'], ascending: true }),
			listScheduledLives({ statuses: ['ended', 'cancelled'], ascending: false, limit: 100 })
		]);

	const hasRecorderStatus = (v: unknown): v is RecorderStatus =>
		typeof v === 'object' && v !== null && 'recording' in v;

	const recorder = hasRecorderStatus(statusResult)
		? { available: true as const, ...statusResult }
		: { available: false as const, error: statusResult.error };

	return {
		list,
		recordingId,
		initialStatus,
		service,
		replayChoices:
			service?.status === 'ended' &&
			!service.is_test &&
			(!recordingId || !(await getRecordingById(recordingId)))
				? (await listRecordings({ status: 'ready', limit: 25 })).data
				: [],
		recorder,
		icecast,
		liveStreamUrl: icecastStreamUrl(),
		// HLS DVR feed for the live monitor — PDT gives the exact on-air time
		// of what the operator hears, making the subtitle anchor exact.
		liveHlsUrl: liveAudioHlsUrl(),
		broadcast,
		subscriberCount,
		upcomingLives,
		pastLives,
		// Base for the public watch links (/live/<slug>).
		publicBaseUrl: (process.env.MAIN_SITE_URL || 'https://missionnaire.net').replace(/\/$/, '')
	};
};

export const actions: Actions = {
	attachReplay: async ({ cookies, request, getClientAddress }) => {
		const user = await verifyAdminSession(cookies);
		if (!getPermissions(user).can_manage_recordings) throw error(403, 'Accès refusé');
		const fields = await request.formData();
		const id = fields.get('service');
		const recordingId = fields.get('recording');
		if (typeof id !== 'string' || typeof recordingId !== 'string')
			return fail(400, { replayError: 'Choose a recording.' });
		const [service, recording] = await Promise.all([
			getScheduledLiveById(id),
			getRecordingById(recordingId)
		]);
		if (service?.status !== 'ended' || service.is_test || recording?.status !== 'ready') {
			return fail(409, { replayError: 'Choose a ready recording for an ended service.' });
		}
		const existingId = service.recording_id;
		const replacesMissing =
			existingId && existingId !== recordingId && !(await getRecordingById(existingId))
				? existingId
				: undefined;
		if (!(await setScheduledLiveRecordingId(id, recordingId, { replacesMissing }))) {
			return fail(409, { replayError: 'This service already has a replay.' });
		}
		await logAudit({
			user_id: user.email,
			user_email: user.email,
			action: 'update',
			target_collection: 'scheduled_lives',
			target_id: id,
			changes: { recording_id: { old: service.recording_id, new: recordingId } },
			ip_address: getClientAddress()
		});
		redirect(303, `/recordings?service=${id}#service-details`);
	}
};
