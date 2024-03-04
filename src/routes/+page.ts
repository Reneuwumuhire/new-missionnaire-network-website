import GetSermonsVideosUsecase from '../middleware/usecases/get-videos-sermons';

export const load = (async ({ fetch }: any) => {
	const videosUsecase = new GetSermonsVideosUsecase();

	const res = await videosUsecase.execute({
		videoCount: 12,
		type: ['any'],
		pageNumber: 1
	});

	if (res.isOk) {
		const value = res.value;
		return {
			videos: value
		};
	} else throw new Error(res.error.message);
}) as any;

// function to load more videos
