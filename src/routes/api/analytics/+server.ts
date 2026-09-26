import { json } from '@sveltejs/kit';
import { getAnalyticsStats, type AnalyticsStats } from '$lib/server/analytics';
import type { RequestHandler } from './$types';

const CACHE_MS = 5 * 60 * 1000;
let cached: { expiresAt: number; stats: AnalyticsStats } | null = null;
let pending: Promise<AnalyticsStats> | null = null;

export const GET: RequestHandler = async () => {
	try {
		if (!cached || cached.expiresAt <= Date.now()) {
			pending ??= getAnalyticsStats().finally(() => (pending = null));
			cached = { stats: await pending, expiresAt: Date.now() + CACHE_MS };
		}

		return json(cached.stats, {
			headers: { 'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' }
		});
	} catch (error) {
		console.error('[Analytics API Error]:', error);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
};
