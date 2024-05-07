// import type { PageServerLoad } from './$types';
// import SearchYtVideosUsecase, { UsecaseArgsSchema } from '@mnlib/lib/usecase/seach-yt-videos';
// import type { YoutubeVideo } from '@mnlib/lib/models/youtube';

// export const load: PageServerLoad = async () => {
// 	const fetchVideos = async () => {
// 		const videoCount = 20;
// 		const pageNumber = 1;
// 		const limit = 20;
// 		const searchTags = ['retransmission', 'branham', 'frank', 'local', 'lettre'];
// 		const usecase = new SearchYtVideosUsecase();
// 		try {
// 			const response = await usecase.execute(
// 				UsecaseArgsSchema.parse({ videoCount, pageNumber, searchTags, limit })
// 			);
// 			if (response.ok) {
// 				const videos: YoutubeVideo[] = response.value;
// 				return {
// 					videos: videos,
// 					error: null
// 				};
// 			} else {
// 				console.error('Error fetching videos data:', response.error);
// 				return {
// 					videos: [],
// 					error: response.error.message
// 				};
// 			}
// 		} catch (error) {
// 			console.error('Error fetching videos data:', error);
// 			return {
// 				videos: [],
// 				error: 'Failed to fetch videos data'
// 			};
// 		}
// 	};

// 	return {
// 		streamed: {
// 			videosRes: fetchVideos()
// 		}
// 	};
// };
