import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
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
const RECENT_EVENT_RETENTION_SECONDS = 7 * 24 * 60 * 60;
let pageEventIndex: Promise<unknown> | null = null;
let playEventIndex: Promise<unknown> | null = null;

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
		const isPlayback = body.event === 'playback';
		const path = typeof body.path === 'string' ? body.path : '';
		if (!isPlayback && (!path.startsWith('/') || path.startsWith('//') || path.length > 500)) {
			return json({ error: 'Invalid path' }, { status: 400 });
		}
		if (
			isPlayback &&
			(!['live', 'sermon', 'song', 'song_video', 'recording'].includes(body.kind) ||
				typeof body.id !== 'string' ||
				!body.id.trim() ||
				body.id.length > 200 ||
				typeof body.title !== 'string' ||
				!body.title.trim() ||
				body.title.length > 200)
		)
			return json({ error: 'Invalid playback' }, { status: 400 });

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
		if (isPlayback) {
			if (!dev) {
				await db.collection('analytics_plays').updateOne(
					{ _id: `${today}:${body.kind}:${body.id}:${visitorId}` as never },
					{
						$setOnInsert: {
							date: today,
							visitorId,
							kind: body.kind,
							itemId: body.id,
							title: body.title.trim(),
							createdAt: now
						}
					},
					{ upsert: true }
				);
			}
			const playEvents = db.collection(
				dev ? 'analytics_preview_play_events' : 'analytics_play_events'
			);
			playEventIndex ??= playEvents
				.createIndex({ occurredAt: 1 }, { expireAfterSeconds: RECENT_EVENT_RETENTION_SECONDS })
				.catch((error) => console.error('[Playback event index]:', error));
			await playEventIndex;
			await playEvents.insertOne({
				occurredAt: new Date(now),
				visitorId,
				kind: body.kind,
				itemId: body.id,
				title: body.title.trim()
			});
			return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
		}
		if (!dev)
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
		const pageEvents = db.collection(
			dev ? 'analytics_preview_page_events' : 'analytics_page_events'
		);
		pageEventIndex ??= pageEvents
			.createIndex({ occurredAt: 1 }, { expireAfterSeconds: RECENT_EVENT_RETENTION_SECONDS })
			.catch((error) => console.error('[Page event index]:', error));
		await pageEventIndex;
		await pageEvents.insertOne({
			occurredAt: new Date(now),
			visitorId,
			path,
			device: classifyDevice(userAgent),
			country: getFullCountryName(countryCode),
			referrer
		});

		return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
	} catch (error) {
		console.error('[Analytics Tracking Error]:', error);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
};
