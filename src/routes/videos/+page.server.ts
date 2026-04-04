import type { PageServerLoad } from './$types';
import { getCollection, getVideoById, getYouTubeCachedStatus } from '../../db/collections';

export const load: PageServerLoad = async ({ url }) => {
	const filter = url.searchParams.get('filter') || 'All';
	const search = url.searchParams.get('search') || '';
	const videoId = url.searchParams.get('v') || '';

	const [videos, liveStatus, requestedVideo] = await Promise.all([
		getCollection('videos', 0, 20, filter, search),
		getYouTubeCachedStatus(),
		videoId ? getVideoById(videoId) : Promise.resolve(null)
	]);

	return {
		data: videos,
		liveStatus,
		requestedVideo
	};
};
