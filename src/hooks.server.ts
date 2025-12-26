import { connect, getDb } from './db/mongo';
import type { Handle } from '@sveltejs/kit';

// Initialize MongoDB on server start
connect()
	.then(() => {
		console.log('[MongoDB] Database connection initialized on startup');
	})
	.catch((e) => {
		console.error('[MongoDB] Initialization failed:', e);
	});
export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	const userAgent = event.request.headers.get('user-agent') || 'unknown';
	const isVercelBot = userAgent.includes('vercel-screenshot');

	// Ignore static assets, API routes, internal requests, and Vercel bots for tracking
	const isPageRequest =
		!pathname.includes('.') &&
		!pathname.startsWith('/api/') &&
		!pathname.startsWith('/_') &&
		!isVercelBot;

	if (isPageRequest) {
		try {
			const db = await getDb();
			if (db) {
				const analytics = db.collection('analytics');

				let ip = '127.0.0.1';
				try {
					ip = event.getClientAddress();
				} catch (e) {
					console.warn('[Tracking] Could not determine client IP:', e);
				}
				const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

				// Extract Country and City from common proxy headers (e.g. Cloudflare, Vercel)
				const country =
					event.request.headers.get('cf-ipcountry') ||
					event.request.headers.get('x-vercel-ip-country') ||
					'Unknown';
				const city = event.request.headers.get('x-vercel-ip-city') || 'Unknown';

				// Basic Device Detection
				let device = 'Desktop';
				if (/mobile|android|iphone|ipad|phone/i.test(userAgent)) {
					device = 'Mobile';
				} else if (/tablet/i.test(userAgent)) {
					device = 'Tablet';
				}

				// Record unique daily visits per IP with enhanced data
				await analytics.updateOne(
					{ date: today, ip: ip },
					{
						$setOnInsert: {
							userAgent,
							country,
							city,
							device,
							timestamp: Date.now()
						}
					},
					{ upsert: true }
				);
			}
		} catch (error) {
			console.error('[Tracking Error]:', error);
		}
	}

	const response = await resolve(event);
	return response;
};
