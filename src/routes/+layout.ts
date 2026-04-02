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
		// Use server data if available, otherwise null (or whatever default)
		liveStream: data?.liveStream ?? null,
		queryClient
	};
};
