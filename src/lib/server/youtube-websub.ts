import { PUBLIC_MAIN_URL } from '$env/static/public';
import { claimCheckSlot } from '../../db/collections';

const CHANNEL_ID = 'UCS3zqpqnCvT0SFa_jI662Kg';
const HUB_URL = 'https://pubsubhubbub.appspot.com/subscribe';
const TOPIC_URL = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

// Re-subscribe every 4 days (subscriptions expire after ~5 days)
const SUBSCRIBE_INTERVAL = 4 * 24 * 60 * 60 * 1000;

/**
 * Subscribe to YouTube channel feed via WebSub (PubSubHubbub).
 *
 * Google will push Atom XML notifications to our webhook whenever
 * a video is published or updated on the channel.
 *
 * Throttled via DB lock so multiple serverless instances don't
 * send duplicate subscription requests.
 */
export async function ensureWebSubSubscription(): Promise<void> {
	// Only re-subscribe every 4 days
	const canSubscribe = await claimCheckSlot('youtube_websub', SUBSCRIBE_INTERVAL);
	if (!canSubscribe) return;

	const callbackUrl = getCallbackUrl();
	if (!callbackUrl) {
		console.warn('[WebSub] No callback URL configured. Set PUBLIC_MAIN_URL.');
		return;
	}

	try {
		const body = new URLSearchParams({
			'hub.callback': callbackUrl,
			'hub.topic': TOPIC_URL,
			'hub.verify': 'async',
			'hub.mode': 'subscribe',
			'hub.lease_seconds': '432000' // 5 days
		});

		const response = await fetch(HUB_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString()
		});

		if (response.status === 202 || response.status === 204) {
			console.log('[WebSub] Subscription request accepted');
		} else {
			const text = await response.text();
			console.error(`[WebSub] Subscription failed: ${response.status} — ${text}`);
		}
	} catch (error) {
		console.error('[WebSub] Subscription error:', error);
	}
}

function getCallbackUrl(): string | null {
	const baseUrl = PUBLIC_MAIN_URL;
	if (!baseUrl) return null;

	// Normalize: remove trailing slash, add webhook path
	const base = baseUrl.replace(/\/+$/, '');
	return `${base}/api/webhooks/youtube`;
}

// ── Schedule-aware pre-warming ─────────────────────────────────

/**
 * Live stream schedule (Berlin timezone):
 * - Wednesday 19:30
 * - Saturday  19:30
 * - Sunday    10:00
 *
 * Returns true if we're within a window around a scheduled live time,
 * meaning we should poll more aggressively as a safety net.
 */
export function isNearScheduledLiveTime(): boolean {
	const now = new Date();

	// Get current time in Berlin
	const berlinTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
	const day = berlinTime.getDay(); // 0=Sun, 3=Wed, 6=Sat
	const hours = berlinTime.getHours();
	const minutes = berlinTime.getMinutes();
	const timeInMinutes = hours * 60 + minutes;

	// Check if we're within 15 minutes before or 2 hours after a scheduled time
	const PRE_WINDOW = 15; // minutes before
	const POST_WINDOW = 120; // minutes after

	const schedules: Array<{ day: number; time: number }> = [
		{ day: 3, time: 19 * 60 + 30 }, // Wednesday 19:30
		{ day: 6, time: 19 * 60 + 30 }, // Saturday 19:30
		{ day: 0, time: 10 * 60 },       // Sunday 10:00
	];

	return schedules.some(({ day: schedDay, time: schedTime }) => {
		if (day !== schedDay) return false;
		return timeInMinutes >= schedTime - PRE_WINDOW && timeInMinutes <= schedTime + POST_WINDOW;
	});
}
