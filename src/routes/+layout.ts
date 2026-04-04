import { browser } from '$app/environment';
import { QueryClient } from '@tanstack/svelte-query';

export const trailingSlash = 'never';
export const load = async ({ data }) => {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				enabled: browser,
				staleTime: 60 * 1000
			}
		}
	});
	return {
		liveStream: data?.liveStream ?? null,
		radioIsLive: data?.radioIsLive ?? false,
		queryClient
	};
};
