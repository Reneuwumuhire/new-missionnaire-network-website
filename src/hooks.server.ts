import { connect, getDb } from './db/mongo';
import { checkAndIngestLiveStream } from './lib/server/youtube-poller';
import { ensureWebSubSubscription } from '$lib/server/youtube-websub';
import { redirect, type Handle } from '@sveltejs/kit';
import { isBotUserAgent } from './utils/botDetection';
import { startRadioProbeScheduler } from '$lib/server/radio-probe-scheduler';

if (process.env.RAILWAY_PRIVATE_DOMAIN) startRadioProbeScheduler();

// Initialize MongoDB on server start, then:
// 1. Run an initial YouTube check (self-throttled via DB lock)
// 2. Ensure WebSub subscription is active (re-subscribes every 4 days)
connect()
	.then(async () => {
		console.log('[MongoDB] Database connection initialized on startup');
		await checkAndIngestLiveStream();
		await ensureWebSubSubscription();
	})
	.catch((e) => {
		console.error('[MongoDB] Initialization failed:', e);
	});

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

	// Old /live/archives URLs were renamed to /live/rediffusions. Preserve
	// inbound links (bookmarks, search results) with a permanent redirect.
	if (pathname === '/live/archives' || pathname.startsWith('/live/archives/')) {
		const target = pathname.replace('/live/archives', '/live/rediffusions') + event.url.search;
		throw redirect(308, target);
	}

	const userAgent = event.request.headers.get('user-agent') || 'unknown';
	const isPageRequest =
		!pathname.includes('.') &&
		!pathname.startsWith('/api/') &&
		!pathname.startsWith('/_') &&
		!isBotUserAgent(userAgent);

	// Fire and forget livestream check (self-throttled via DB lock)
	if (isPageRequest) {
		checkAndIngestLiveStream().catch((e) => console.error('[Hooks] Poller error:', e));
	}

	const response = await resolve(event);

	// Fire and forget missed route tracking
	trackMissedRoute(event, response, isPageRequest);

	// Cache static assets (images, icons, fonts) for 1 year
	if (
		pathname.startsWith('/img/') ||
		pathname.startsWith('/icons/') ||
		pathname.startsWith('/fonts/') ||
		/\.(webp|jpg|jpeg|png|svg|ico|woff2?|ttf|otf)$/i.test(pathname)
	) {
		response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
	}

	return response;
};
