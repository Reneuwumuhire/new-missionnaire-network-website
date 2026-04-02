import { connect, getDb } from './db/mongo';
import { checkAndIngestLiveStream } from './lib/server/youtube-poller';
import { ensureBrokerPolling } from '$lib/server/radio-status-broker';
import type { Handle } from '@sveltejs/kit';
import { getFullCountryName } from './utils/countries';

let lastCheckTime = 0;
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes — RSS is free, videos.list is 1 unit

// Initialize MongoDB on server start
connect()
	.then(() => {
		console.log('[MongoDB] Database connection initialized on startup');
	})
	.catch((e) => {
		console.error('[MongoDB] Initialization failed:', e);
	});

// Run an immediate check on startup to populate in-memory state
checkAndIngestLiveStream().catch((e) => console.error('[Startup] Poller error:', e));

// Start the radio status broker independently of SSE clients.
// This ensures push notifications fire even when nobody has the site open.
ensureBrokerPolling();

async function trackAnalytics(event: any, isPageRequest: boolean) {
	if (!isPageRequest) return;

	try {
		const db = await getDb();
		if (!db) return;

		const analytics = db.collection('analytics');
		const { pathname } = event.url;
		const userAgent = event.request.headers.get('user-agent') || 'unknown';
		const referrer = event.request.headers.get('referer') || 'direct';

		let ip = 'unknown';
		try {
			ip = event.getClientAddress();
		} catch (e) {
			console.warn('[Tracking] Could not determine client IP:', e);
		}
		const today = new Date().toISOString().split('T')[0];

		const countryCode =
			event.request.headers.get('cf-ipcountry') ||
			event.request.headers.get('x-vercel-ip-country') ||
			'Unknown';
		const countryFull = getFullCountryName(countryCode);
		const city = event.request.headers.get('x-vercel-ip-city') || 'Unknown';

		let device = 'Desktop';
		if (/mobile|android|iphone|phone/i.test(userAgent)) {
			device = 'Mobile';
		} else if (/tablet|ipad/i.test(userAgent)) {
			device = 'Tablet';
		} else if (/bot|spider|crawl/i.test(userAgent)) {
			device = 'Bot';
		}

		const now = Date.now();
		await analytics.updateOne(
			{ date: today, ip: ip, userAgent: userAgent },
			{
				$setOnInsert: {
					userAgent,
					countryShort: countryCode,
					countryFull,
					city,
					device,
					referrer,
					firstSeen: now
				},
				$set: { lastSeen: now },
				$inc: { pageViews: 1 },
				$addToSet: { viewedPaths: pathname }
			},
			{ upsert: true }
		);
	} catch (error) {
		console.error('[Tracking Error]:', error);
	}
}

async function trackMissedRoute(event: any, response: Response, isPageRequest: boolean) {
	if (response.status !== 404 || !isPageRequest) return;

	try {
		const db = await getDb();
		if (!db) return;

		const missedRoutes = db.collection('missed_routes');
		const referrer = event.request.headers.get('referer') || 'direct';
		await missedRoutes.updateOne(
			{ path: event.url.pathname },
			{
				$inc: { count: 1 },
				$set: { lastMissed: Date.now() },
				$addToSet: { referrers: referrer }
			},
			{ upsert: true }
		);
	} catch (e) {
		console.error('[Missed Route Tracking Error]:', e);
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	const userAgent = event.request.headers.get('user-agent') || 'unknown';
	const isVercelBot =
		userAgent.includes('vercel-screenshot') || userAgent.includes('vercel-favicon/1.0');

	const isPageRequest =
		!pathname.includes('.') &&
		!pathname.startsWith('/api/') &&
		!pathname.startsWith('/_') &&
		!isVercelBot;

	// Fire and forget analytics tracking
	trackAnalytics(event, isPageRequest);

	// Fire and forget livestream check (throttled)
	const now = Date.now();
	if (now - lastCheckTime > CHECK_INTERVAL) {
		lastCheckTime = now;
		checkAndIngestLiveStream().catch((e) => console.error('[Hooks] Poller error:', e));
	}

	// Radio live checks + push notifications are handled by the radio-status-broker
	// on its own 5-second interval, independent of HTTP traffic.

	const response = await resolve(event);

	// Fire and forget missed route tracking
	trackMissedRoute(event, response, isPageRequest);

	return response;
};
