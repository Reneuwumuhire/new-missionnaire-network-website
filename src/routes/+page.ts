import type { YoutubeVideo } from '@mnlib/lib/models/youtube';
import GetSermonsVideosUsecase from '../middleware/usecases/get-videos-sermons';

export const load = async ({ fetch }: any) => {
	const videosUsecase = new GetSermonsVideosUsecase();

	const res = await videosUsecase.execute({
		videoCount: 12,
		type: ['branham'],
		pageNumber: 1
	});
	let videos: YoutubeVideo[];
	if (!res.isOk) videos = [];
	else videos = res.value;

	return {
		videos
	};
};

// function to load more videos
