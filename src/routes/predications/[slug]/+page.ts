import { VideoItemSchema, type SearchVideosResult } from '../../../core/model/youtube';
import { writable } from 'svelte/store';

export const load = async ({ fetch, session }: any) => {
	const loading = writable(true); // Initialize a writable store for loading state

	try {
		const requestOptions = {
			method: 'GET'
		};
		const url = '/api/yt/recent-videos?resultsPerPage=50';

		const response = await fetch(url, requestOptions);

		const apiResult: SearchVideosResult = await response.json();

		// Set loading to false after fetching data
		loading.set(false);

		return {
			resultsPerPage: apiResult.resultsPerPage,
			videos: VideoItemSchema.array().parse(apiResult.videos),
			loading // Pass the loading store as part of the data to the page
		};
	} catch (error: any) {
		console.error('Error fetching data:', error);
		// Set loading to false in case of an error
		loading.set(false);
		// You can handle errors or provide default data here if needed
		return {
			resultsPerPage: 0,
			videos: [],
			loading,
			error: error.message
		};
	}
};
