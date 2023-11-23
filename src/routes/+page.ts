import type { PageLoad } from './$types';
import { VideoItemSchema, type VideoItem, type SearchVideosResult } from '../core/model/youtube';

export const load = (async ({ fetch }) => {
	const requestOptions = {
		method: 'GET'
	};
	const url = '/api/yt/recent-videos?resultsPerPage=50';

	const response = await fetch(url, requestOptions);

	const apiResult: SearchVideosResult = await response.json();
	return {
		resultsPerPage: apiResult.resultsPerPage,
		videos: VideoItemSchema.array().parse(apiResult.videos)
	};
}) satisfies PageLoad;
