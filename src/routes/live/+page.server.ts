import { getRecentPublished } from '$lib/server/recordings';
import { getBroadcastAdminState, getRadioCachedStatus } from '../../db/collections';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders, url }) => {
	// Edge-cache the rendered page, but keep the freshness window short so a
	// newly published rediffusion appears in "Directs précédents" within ~a
	// minute rather than a day. The live banner + radio player are hydrated
	// client-side (LiveRadioPlayer fetches /api/live/radio-state then streams
	// SSE updates), so the only server-rendered data here is the recordings
	// list. With s-maxage=60 the edge serves a cached copy for a minute, then
	// `stale-while-revalidate` keeps every later hit instant — the edge returns
	// the stale copy immediately and refreshes it in the background, so a fresh
	// recording propagates on the next request instead of blocking on the DB.
	setHeaders({
		'cache-control': 'public, s-maxage=60, stale-while-revalidate=600'
	});

	const [recentRecordings, adminGate, status] = await Promise.all([
		getRecentPublished(5),
		getBroadcastAdminState(),
		getRadioCachedStatus()
	]);

	// "Live" exactly as /api/live/radio-state computes it: the admin gate must
	// be on AND Icecast must actually be serving audio. Mirroring it keeps the
	// share preview consistent with what the player shows — no "live" card when
	// the audio isn't really flowing.
	const isLive = (status?.isLive ?? false) && adminGate.is_live;

	// Server-rendered Open Graph / Twitter data so link-preview crawlers
	// (WhatsApp, Facebook, iMessage…) show the current live title + thumbnail
	// when someone shares the /live link. Crawlers don't run JS, hence why
	// this can't live only in the client-hydrated player. The title/thumbnail
	// come from the same stream source the player uses — `broadcast_admin_state`
	// (via radio-state). Falls back to the generic page metadata when nothing is
	// on air. Resolve the thumbnail to an absolute URL — relative paths break
	// OG image previews.
	const rawThumb = isLive ? adminGate.thumbnail_url : null;
	const ogImage = rawThumb
		? rawThumb.startsWith('http')
			? rawThumb
			: new URL(rawThumb, url.origin).toString()
		: null;

	return {
		recentRecordings,
		liveMeta: {
			isLive,
			title: isLive ? adminGate.title : null,
			description: isLive ? adminGate.description : null,
			thumbnailUrl: ogImage
		}
	};
};
