import GetSermonsVideosUsecase from '../middleware/usecases/get-videos-sermons';

export const load = (async ({ fetch }: any) => {
	const videosUsecase = new GetSermonsVideosUsecase();
	const res =  await videosUsecase.execute({
		videoCount: 10,
		type: ["frank"],
		pageNumber: 1
	});
	if(res.isOk) {
		const value = res.value;
		return(
			{
				videos: value
			}
		)
	}
	else throw new Error(res.error.message);
	;
}) as any;
