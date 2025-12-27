import { browser } from '$app/environment';
import GetCurrentLiveStreamingEventsUsecase from '../middleware/usecases/current-livestreaming-videos';
import { QueryClient } from '@tanstack/svelte-query';
export const load = async ({ data }) => {
	// If server already provided liveStream data, use it.
	// Otherwise (or if null), try the client-side usecase?
	// Actually, the server is now the source of truth.
	// Let's rely on the server data.

	// const IsLiveStreamlive = await new GetCurrentLiveStreamingEventsUsecase().execute();

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				enabled: browser,
				staleTime: 60 * 1000
			}
		}
	});
	return {
		// Use server data if available, otherwise null (or whatever default)
		liveStream: data?.liveStream ?? null,
		queryClient
	};
};
