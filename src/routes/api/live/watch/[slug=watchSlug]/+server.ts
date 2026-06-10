import { json, error } from '@sveltejs/kit';
import { getWatchState } from '$lib/server/scheduled-lives';

// Client polling endpoint for the watch page (/live/<slug>). The page itself
// is edge-cached for first paint; THIS endpoint is what drives the live
// waiting-room → player → replay transitions, so it must never be cached.
export async function GET({ params, setHeaders }) {
	setHeaders({
		'Cache-Control': 'no-store, no-cache, must-revalidate',
		Pragma: 'no-cache'
	});

	const state = await getWatchState(params.slug);
	if (!state) throw error(404, 'Direct introuvable');

	return json({
		phase: state.phase,
		isLive: state.isLive,
		replayPath: state.replayPath,
		scheduledAt: state.live.scheduled_at,
		title: state.live.title,
		description: state.live.description,
		thumbnailUrl: state.live.thumbnail_url
	});
}
