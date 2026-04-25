import { browser } from '$app/environment';
import type { YoutubeVideo } from '$lib/models/youtube';
import type { YouTubeCachedStatus } from '../../db/collections';

export const load = async ({ fetch, url }) => {
	const filter = url.searchParams.get('filter') || 'All';
	const search = url.searchParams.get('search') || '';
	const videoId = url.searchParams.get('v') || '';

	const baseShape = {
		filter,
		search,
		videoId
	};

	if (browser) {
		return {
			...baseShape,
			videos: [] as YoutubeVideo[],
			liveStatus: null as YouTubeCachedStatus | null,
			requestedVideo: null as YoutubeVideo | null,
			deferred: true
		};
	}

	const params = new URLSearchParams({ filter, search });
	if (videoId) params.set('v', videoId);

	const response = await fetch(`/api/videos-page?${params.toString()}`);
	if (!response.ok) {
		return {
			...baseShape,
			videos: [] as YoutubeVideo[],
			liveStatus: null as YouTubeCachedStatus | null,
			requestedVideo: null as YoutubeVideo | null,
			deferred: false
		};
	}

	const result = await response.json();

	return {
		...baseShape,
		videos: (result.data || []) as YoutubeVideo[],
		liveStatus: (result.liveStatus || null) as YouTubeCachedStatus | null,
		requestedVideo: (result.requestedVideo || null) as YoutubeVideo | null,
		deferred: false
	};
};
