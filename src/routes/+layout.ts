import { browser } from '$app/environment';
import GetCurrentLiveStreamingEventsUsecase from '../middleware/usecases/current-livestreaming-videos';
import { QueryClient } from '@tanstack/svelte-query';
export const load = async () => {
	const IsLiveStreamlive = await new GetCurrentLiveStreamingEventsUsecase().execute();

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				enabled: browser,
				staleTime: 60 * 1000
			}
		}
	});
	return {
		liveStream: IsLiveStreamlive.isOk ? IsLiveStreamlive.value : null,
		queryClient
	};
};
