import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import {
	listRecordings,
	listScheduledLives,
	getBroadcastAdminState,
	countPushSubscriptions
} from '../../db/collections';
import { RecorderError, recorderStatus, type RecorderStatus } from '$lib/server/recorder-client';
import { getIcecastSnapshot, icecastStreamUrl } from '$lib/server/icecast';

export const load: PageServerLoad = async ({ locals }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	// Initial paint just shows the 5 most recent recordings — the rest are
	// fetched on demand via /api/recordings/list (search / load more). The
	// list is STREAMED (not awaited) so the control center renders with
	// skeleton rows while MongoDB works; the page resolves it in onMount.
	const list = listRecordings({ limit: 5 });
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
		listScheduledLives({ statuses: ['ended', 'cancelled'], ascending: false, limit: 20 })
	]);

	const hasRecorderStatus = (v: unknown): v is RecorderStatus =>
		typeof v === 'object' && v !== null && 'recording' in v;

	const recorder = hasRecorderStatus(statusResult)
		? { available: true as const, ...statusResult }
		: { available: false as const, error: statusResult.error };

	return {
		list,
		recorder,
		icecast,
		liveStreamUrl: icecastStreamUrl(),
		broadcast,
		subscriberCount,
		upcomingLives,
		pastLives,
		// Base for the public watch links (/live/<slug>).
		publicBaseUrl: (env.MAIN_SITE_URL || 'https://missionnaire.net').replace(/\/$/, '')
	};
};
