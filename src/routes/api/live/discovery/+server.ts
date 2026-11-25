import { getLiveDiscovery } from '$lib/server/live-discovery';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ fetch }) =>
	Response.json(await getLiveDiscovery({ fetchFn: fetch }), {
		headers: { 'cache-control': 'public, max-age=0, s-maxage=10' }
	});
