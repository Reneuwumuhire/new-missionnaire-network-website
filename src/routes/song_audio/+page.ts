import type { YoutubeVideo } from '@mnlib/lib/models/youtube';
import GetSermonsVideosUsecase from '../../middleware/usecases/get-videos-sermons';

type VideosResponse = {
	data: YoutubeVideo[];
	error: string;
};
type RouteParams = {
	page: number;
	searchTags: string[];
};

let pageResponse: {
	videosResponse: VideosResponse;
};

export const load = async ({ params, url }: { params: RouteParams; url: URL }) => {
	const videosUsecase = new GetSermonsVideosUsecase();
	const searchTags = ['song'];
	const pageNumber = 1;

	const videosRes = await videosUsecase.execute({
		videoCount: 5,
		type: searchTags,
		pageNumber: (pageNumber as number) || 1
	});

	if (videosRes.isOk) {
		pageResponse = {
			videosResponse: {
				data: videosRes.value,
				error: ''
			}
		};
		return pageResponse;
	} else {
		if (videosRes.isErr) {
			pageResponse.videosResponse = {
				data: [],
				error: new Error('Failed to load videos').message
			};
		}
		return {
			videosResponse: pageResponse.videosResponse
		};
	}
};
