import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { getCollection, getVideoById, getYouTubeCachedStatus } from '../../../db/collections';

const PAGE_SIZE = 20;

export async function GET({ url }: RequestEvent) {
	try {
		const filter = url.searchParams.get('filter') || 'All';
		const search = url.searchParams.get('search') || '';
		const videoId = url.searchParams.get('v') || '';

		const [videos, liveStatus, requestedVideo] = await Promise.all([
			getCollection('videos', 0, PAGE_SIZE, filter, search),
			getYouTubeCachedStatus(),
			videoId ? getVideoById(videoId) : Promise.resolve(null)
		]);

		return json({
			data: videos,
			liveStatus,
			requestedVideo,
			filter,
			search,
			videoId
		});
	} catch (error) {
		return json(
			{
				error: error instanceof Error ? error.message : 'Impossible de charger les vidéos',
				data: [],
				liveStatus: null,
				requestedVideo: null
			},
			{ status: 500 }
		);
	}
}
