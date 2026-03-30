import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { getCollection } from '../db/collections';
import { getLiveStatus } from '../lib/server/youtube-poller';
import { probeLiveAudio } from '$lib/server/live-audio';

export const load: PageServerLoad = async ({ url, fetch }) => {
	const filter = url.searchParams.get('filter');
	const search = url.searchParams.get('search');

	// Redirect legacy filter/search URLs to /predications
	if (filter || search) {
		const params = new URLSearchParams();
		if (filter) params.set('filter', filter);
		if (search) params.set('search', search);
		throw redirect(301, `/videos?${params.toString()}`);
	}

	const [videos, liveStatus, radioProbe] = await Promise.all([
		getCollection('videos', 0, 3, 'All', ''),
		getLiveStatus(),
		probeLiveAudio(fetch)
	]);

	return {
		data: videos,
		liveStatus,
		radioStatus: {
			isLive: radioProbe.isLive,
			sourceUrl: radioProbe.sourceUrl
		}
	};
};
