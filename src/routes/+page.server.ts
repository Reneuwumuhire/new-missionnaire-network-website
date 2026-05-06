import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { getCollection } from '../db/collections';
import { getLastStatus } from '$lib/server/radio-status-broker';

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	const filter = url.searchParams.get('filter');
	const search = url.searchParams.get('search');

	// Redirect legacy filter/search URLs to /predications
	if (filter || search) {
		const params = new URLSearchParams();
		if (filter) params.set('filter', filter);
		if (search) params.set('search', search);
		throw redirect(301, `/videos?${params.toString()}`);
	}

	// Edge-cache the rendered HTML. The homepage shows the 3 most recent
	// videos and a radio "is live" indicator — both tolerate up to a
	// minute of staleness (the client polls /api/live/radio-poll every
	// 10s and overrides the SSR value via the radioIsLive store, so the
	// indicator stays fresh even on a stale HTML hit). Without this every
	// reload re-runs the MongoDB queries and listeners stare at the
	// inline splash until SSR completes.
	setHeaders({
		'cache-control': 'public, s-maxage=60, stale-while-revalidate=600'
	});

	const [videos, radioStatus] = await Promise.all([
		getCollection('videos', 0, 3, 'All', ''),
		getLastStatus()
	]);

	return {
		data: videos,
		radioStatus: {
			isLive: radioStatus?.isLive ?? false,
			sourceUrl: radioStatus?.streamUrl ?? ''
		}
	};
};
