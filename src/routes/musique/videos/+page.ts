import { browser } from '$app/environment';
import type { YoutubeVideo } from '$lib/models/youtube';
import { pageMeta } from '$lib/seo';

export const load = async ({ fetch, url }) => {
	const search = url.searchParams.get('search') || '';

	// Rendered by the root layout as the single og:*/twitter:* tag set.
	const meta = pageMeta('/musique/videos', {
		title: 'Chants en Vidéo - Missionnaire Network',
		description:
			'Regardez les chants en vidéo du Message, avec recherche et lecture continue, pour votre adoration quotidienne.'
	});

	if (browser) {
		return {
			videos: [] as YoutubeVideo[],
			total: 0,
			search,
			meta,
			deferred: true
		};
	}

	const queryParams = new URLSearchParams({
		type: 'song',
		search,
		maxResults: '20',
		skip: '0'
	});

	const response = await fetch(`/api/yt/videos?${queryParams.toString()}`);
	const result = await response.json();

	return {
		videos: (result.data || []) as YoutubeVideo[],
		total: (result.total || 0) as number,
		search,
		meta,
		deferred: false
	};
};
