import { getRecentPublished } from '$lib/server/recordings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
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

	const recentRecordings = await getRecentPublished(5);
	return { recentRecordings };
};
