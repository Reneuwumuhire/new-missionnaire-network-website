import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { getCollection } from '../db/collections';

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

	// Brief edge cache so the homepage stays cheap under load without
	// pinning a stale "live" badge for long. The banner + button both read
	// from the layout's `radioState` (admin-gate aware), so if admin ends a
	// broadcast within this window the next visitor (≤10s later) sees the
	// updated state. Open tabs already in the page get an instant push via
	// the SW broadcast for *go-live* events; *end-live* still requires a
	// reload or in-app navigation today.
	setHeaders({
		'cache-control': 'public, s-maxage=10, stale-while-revalidate=60'
	});

	const videos = await getCollection('videos', 0, 3, 'All', '');

	return {
		data: videos
	};
};
