import { json } from '@sveltejs/kit';
import { getAnalyticsStats, type AnalyticsStats } from '$lib/server/analytics';
import { getDb } from '../../../db/mongo';
import { getFullCountryName } from '../../../utils/countries';
import { classifyDevice, isBotUserAgent } from '../../../utils/botDetection';
import { getTodayInKigali } from '../../../utils/time';
import { randomUUID } from 'node:crypto';
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

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const userAgent = request.headers.get('user-agent');
	const origin = request.headers.get('origin');
	if (
		isBotUserAgent(userAgent) ||
		request.headers.get('sec-fetch-site') !== 'same-origin' ||
		(origin && origin !== url.origin)
	) {
		return new Response(null, { status: 204 });
	}

	try {
		const body = await request.json();
		const path = typeof body.path === 'string' ? body.path : '';
		if (!path.startsWith('/') || path.startsWith('//') || path.length > 500) {
			return json({ error: 'Invalid path' }, { status: 400 });
		}

		const savedId = cookies.get('mn_visitor');
		const visitorId = savedId && /^[\w-]{20,64}$/.test(savedId) ? savedId : randomUUID();
		cookies.set('mn_visitor', visitorId, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			maxAge: 60 * 60 * 24 * 180
		});

		let referrer = 'direct';
		if (typeof body.referrer === 'string' && body.referrer.length <= 1000) {
			try {
				const parsed = new URL(body.referrer);
				referrer = `${parsed.origin}${parsed.pathname}`;
			} catch {
				// Invalid referrers are recorded as direct visits.
			}
		}

		const countryCode =
			request.headers.get('cf-ipcountry') ||
			request.headers.get('x-vercel-ip-country') ||
			'Unknown';
		const now = Date.now();
		const today = getTodayInKigali();
		const db = await getDb();
		await db.collection('analytics').updateOne(
			{ _id: `human:${today}:${visitorId}` as never },
			{
				$setOnInsert: {
					visitorId,
					date: today,
					countryShort: countryCode,
					countryFull: getFullCountryName(countryCode),
					referrer,
					firstSeen: now
				},
				$set: {
					verifiedHuman: true,
					userAgent,
					device: classifyDevice(userAgent),
					lastSeen: now
				},
				$inc: { pageViews: 1 },
				$addToSet: { viewedPaths: path }
			},
			{ upsert: true }
		);

		return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
	} catch (error) {
		console.error('[Analytics Tracking Error]:', error);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
};
