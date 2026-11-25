import {
	getBroadcastAdminState,
	getNextPublicScheduledLive,
	getRadioCachedStatus
} from '../../db/collections';
import { getRecentPublished } from './recordings';
import { refreshRadioSnapshot } from './icecast';

export async function getLiveDiscovery({
	gate = getBroadcastAdminState(),
	radio = getRadioCachedStatus(),
	recordings,
	fetchFn
}: {
	gate?: ReturnType<typeof getBroadcastAdminState>;
	radio?: ReturnType<typeof getRadioCachedStatus>;
	recordings?: ReturnType<typeof getRecentPublished>;
	fetchFn?: typeof fetch;
} = {}) {
	const [broadcast, cachedAudio, next] = await Promise.all([
		gate,
		radio,
		getNextPublicScheduledLive().catch(() => null)
	]);
	const upcoming =
		next?.slug && Number.isFinite(Date.parse(next.scheduled_at))
			? {
					kind: 'scheduled' as const,
					href: `/live/${next.slug}`,
					title: next.title,
					scheduledAt: next.scheduled_at
				}
			: null;
	if (broadcast.is_live && !broadcast.is_test) {
		const audio = fetchFn ? await refreshRadioSnapshot(fetchFn, cachedAudio) : cachedAudio;
		if (audio?.isLive) {
			return {
				kind: 'live' as const,
				href: broadcast.scheduled_live_slug ? `/live/${broadcast.scheduled_live_slug}` : '/live',
				upcoming
			};
		}
	}
	if (upcoming) return upcoming;
	const [replay] = await (recordings ?? getRecentPublished(1));
	return replay
		? { kind: 'replay' as const, href: `/live/rediffusions/${replay.id}` }
		: { kind: 'library' as const, href: '/recherche' };
}

export type LiveDiscovery = Awaited<ReturnType<typeof getLiveDiscovery>>;
