import type { YoutubeVideo } from '$lib/models/youtube';

export const load = async ({ fetch, url }) => {
	const search = url.searchParams.get('search') || '';

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
		search
	};
};
