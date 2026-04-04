import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { getCollection } from '../db/collections';
import { getLastStatus } from '$lib/server/radio-status-broker';

export const load: PageServerLoad = async ({ url }) => {
	const filter = url.searchParams.get('filter');
	const search = url.searchParams.get('search');

	// Redirect legacy filter/search URLs to /predications
	if (filter || search) {
		const params = new URLSearchParams();
		if (filter) params.set('filter', filter);
		if (search) params.set('search', search);
		throw redirect(301, `/videos?${params.toString()}`);
	}

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
