import type { z } from 'zod';
import type { PageLoad } from './$types';
import { VideoItemSchema, type VideoItem } from '../core/model/youtube';
import { browser } from '$app/environment';

export const load = (async () => {
	// if (!browser) return { resultsPerPage: 0, videos: [] };

	const requestOptions = {
		method: 'GET'
	};
	const url = `http://127.0.0.1:5173/api/yt/recent-videos?resultsPerPage=50`;

	const response = await fetch(url, requestOptions);

	const apiResult: { resultsPerPage: number; videos: VideoItem[] } = await response.json();

	return {
		resultsPerPage: apiResult.resultsPerPage,
		videos: VideoItemSchema.array().parse(apiResult.videos)
	};
}) satisfies PageLoad;
