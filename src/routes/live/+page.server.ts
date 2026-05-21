import { getRecentPublished } from '$lib/server/recordings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
	// Edge-cache the rendered page for up to a day. Everything time-sensitive
	// on /live (the live banner + the radio player) is hydrated client-side:
	// LiveRadioPlayer fetches /api/live/radio-state on mount and then streams
	// updates via SSE, so it self-corrects within seconds even off a day-old
	// cached document. The only server-rendered data here is the "Directs
	// précédents" list, where stale-within-a-day is fine — a newly published
	// recording simply appears on the next revalidation. `stale-while-revalidate`
	// keeps every hit instant: past the day, the edge serves the cached copy
	// and refreshes it in the background instead of blocking on the DB.
	setHeaders({
		'cache-control': 'public, s-maxage=86400, stale-while-revalidate=86400'
	});

	const recentRecordings = await getRecentPublished(5);
	return { recentRecordings };
};
