import type { YoutubeVideo } from '@mnlib/lib/models/youtube';
import GetSermonsVideosUsecase from '../middleware/usecases/get-videos-sermons';
import GetUpcomingEventsUsecase from '../middleware/usecases/get-upcoming-events';

interface VideosResponse {
	data: YoutubeVideo[];
	error: string;
}
interface UpcomingEventResponse {
	data: YoutubeVideo[];
	error: string;
}
type RouteParams = {
	page: number;
	searchTags: string[];
};

let pageResponse: {
	videosResponse: VideosResponse;
	upcomingEventResponse: UpcomingEventResponse;
};

export const load = async ({ params, url }: { params: RouteParams; url: URL }) => {
	const videosUsecase = new GetSermonsVideosUsecase();
	const upComingEvent = new GetUpcomingEventsUsecase();
	const searchTags = ['retransmission', 'branham', 'frank', 'local', 'lettre'];
	const pageNumber = 1;

	const videosRes = await videosUsecase.execute({
		videoCount: 12,
		type: searchTags,
		pageNumber: (pageNumber as number) || 1
	});

	const upcomingResEvent = await upComingEvent.execute();

	if (videosRes.isOk && upcomingResEvent.isOk) {
		pageResponse = {
			videosResponse: {
				data: videosRes.value,
				error: ''
			},
			upcomingEventResponse: {
				data: upcomingResEvent.value,
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
		} else if (upcomingResEvent.isErr) {
			pageResponse.upcomingEventResponse = {
				data: [],
				error: new Error('Failed to load upcoming events').message
			};
		}
		return {
			videosResponse: pageResponse.videosResponse,
			upcomingEventResponse: pageResponse.upcomingEventResponse
		};
	}
};
