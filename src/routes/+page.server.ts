import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { getCollection } from '../db/collections';
import { pageMeta } from '$lib/seo';
import { getLiveDiscovery } from '$lib/server/live-discovery';

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

	// The live action revalidates on visible tabs independently of the page cache.
	setHeaders({
		'cache-control': 'public, s-maxage=10, stale-while-revalidate=60'
	});

	const [videos, discovery] = await Promise.all([
		getCollection('videos', 0, 3, 'All', ''),
		getLiveDiscovery()
	]);

	return {
		data: videos,
		discovery,
		meta: pageMeta('/', {
			title: 'Missionnaire Network - Accueil | Prédications et Cantiques du Message',
			description:
				'Prédications de William Branham et d’Ewald Frank, audio, transcriptions PDF, livres et cantiques. Posez vos questions sur la Bible et l’Évangile.'
		})
	};
};
