import type { PageServerLoad } from './$types';
import { getCollection, getVideoById } from '../../db/collections';
import { getLiveStatus } from '../../lib/server/youtube-poller';

export const load: PageServerLoad = async ({ url }) => {
	const filter = url.searchParams.get('filter') || 'All';
	const search = url.searchParams.get('search') || '';
	const videoId = url.searchParams.get('v') || '';

	const [videos, liveStatus, requestedVideo] = await Promise.all([
		getCollection('videos', 0, 20, filter, search),
		getLiveStatus(),
		videoId ? getVideoById(videoId) : Promise.resolve(null)
	]);

	return {
		data: videos,
		liveStatus,
		requestedVideo
	};
};
