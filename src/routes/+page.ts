import GetHomeVideosUsecase from '../middleware/usecases/get-videos';

export const load = (async ({ fetch }: any) => {
	const videosUsecase = new GetHomeVideosUsecase();
	const res =  await videosUsecase.execute(10);
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
