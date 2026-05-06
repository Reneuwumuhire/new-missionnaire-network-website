import webpush from 'web-push';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { getAllPushSubscriptions, removePushSubscription } from '../../db/collections';

let vapidConfigured = false;

function ensureVapidConfigured() {
	if (vapidConfigured) return true;

	const publicKey = publicEnv.PUBLIC_VAPID_KEY;
	const privateKey = env.VAPID_PRIVATE_KEY;

	if (!publicKey || !privateKey) {
		console.warn('[Push] VAPID keys not configured — push notifications disabled');
		return false;
	}

	webpush.setVapidDetails('https://missionnaire.net', publicKey, privateKey);
	vapidConfigured = true;
	return true;
}

export interface PushPayload {
	title: string;
	body: string;
	url?: string;
	icon?: string;
	image?: string;
}

export async function sendPushToAll(payload: PushPayload): Promise<void> {
	// Global kill-switch for push delivery. Set PUSH_NOTIFICATIONS_ENABLED=false
	// in main-site .env.local during local dev so test "Aller en direct" clicks
	// don't spam real subscribers. Production should leave this unset (defaults
	// to enabled).
	if (env.PUSH_NOTIFICATIONS_ENABLED === 'false') {
		console.log(`[Push] Disabled via PUSH_NOTIFICATIONS_ENABLED — would have sent: "${payload.title}"`);
		return;
	}

	if (!ensureVapidConfigured()) return;

	const subscriptions = await getAllPushSubscriptions();
	if (subscriptions.length === 0) return;

	const jsonPayload = JSON.stringify(payload);

	const results = await Promise.allSettled(
		subscriptions.map((sub) =>
			webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, jsonPayload)
		)
	);

	let sent = 0;
	let failed = 0;
	let removed = 0;
	for (let i = 0; i < results.length; i++) {
		const result = results[i];
		if (result.status === 'fulfilled') {
			sent++;
			continue;
		}
		const statusCode = result.reason?.statusCode;
		// 410 Gone, 404 Not Found, 401 Unauthorized, 403 Forbidden —
		// subscription is no longer valid or has expired.
		if (statusCode === 410 || statusCode === 404 || statusCode === 401 || statusCode === 403) {
			await removePushSubscription(subscriptions[i].endpoint);
			removed++;
			console.log(`[Push] Removed invalid subscription (${statusCode}):`, subscriptions[i].endpoint);
		} else {
			failed++;
			// Timeouts (ETIMEDOUT / EHOSTUNREACH) are transient — the subscription
			// itself is probably fine; next push attempt will likely succeed.
			console.error(
				'[Push] Failed to send to',
				subscriptions[i].endpoint,
				result.reason?.code ?? result.reason
			);
		}
	}

	const failedSegment = failed > 0 ? `, transient-failed: ${failed}` : '';
	const removedSegment = removed > 0 ? `, removed: ${removed}` : '';
	console.log(
		`[Push] "${payload.title}" — sent: ${sent}/${subscriptions.length}${failedSegment}${removedSegment}`
	);
}

// Pre-built payloads

export function radioLivePayload(opts?: { thumbnailUrl?: string | null }): PushPayload {
	const payload: PushPayload = {
		title: 'Audio en direct',
		body: 'Missionnaire Network est en direct audio maintenant\u00a0!',
		url: '/live',
		icon: '/favicon.png'
	};
	// Only attach `image` if it's an absolute HTTPS URL \u2014 web-push silently
	// drops anything else, and a broken image URL can suppress the whole
	// notification on some Android builds.
	const thumb = opts?.thumbnailUrl;
	if (thumb && /^https:\/\//i.test(thumb)) {
		payload.image = thumb;
	}
	return payload;
}

