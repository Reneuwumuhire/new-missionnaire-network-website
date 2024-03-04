/** @type {import('./$types').PageLoad} */

import GetCurrentLiveStreamingEventsUsecase from '../middleware/usecases/current-livestreaming-videos';

export const load = (async ({ fetch }: any) => {
	const IsLiveStreamlive = await new GetCurrentLiveStreamingEventsUsecase().execute();

	return {
		IsLiveStreamlive
	};
}) as any;
