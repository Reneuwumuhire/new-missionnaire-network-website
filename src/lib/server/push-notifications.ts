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
}

export async function sendPushToAll(payload: PushPayload): Promise<void> {
	if (!ensureVapidConfigured()) return;

	const subscriptions = await getAllPushSubscriptions();
	if (subscriptions.length === 0) return;

	const jsonPayload = JSON.stringify(payload);

	const results = await Promise.allSettled(
		subscriptions.map((sub) =>
			webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, jsonPayload)
		)
	);

	for (let i = 0; i < results.length; i++) {
		const result = results[i];
		if (result.status === 'rejected') {
			const statusCode = result.reason?.statusCode;
			// 410 Gone, 404 Not Found, 401 Unauthorized, 403 Forbidden —
			// subscription is no longer valid or has expired.
			// Push services return various codes for expired/invalid endpoints.
			if (statusCode === 410 || statusCode === 404 || statusCode === 401 || statusCode === 403) {
				await removePushSubscription(subscriptions[i].endpoint);
				console.log(`[Push] Removed invalid subscription (${statusCode}):`, subscriptions[i].endpoint);
			} else {
				console.error('[Push] Failed to send to', subscriptions[i].endpoint, result.reason);
			}
		}
	}

	console.log(
		`[Push] Sent notification to ${subscriptions.length} subscribers: "${payload.title}"`
	);
}

// Pre-built payloads

export function radioLivePayload(): PushPayload {
	return {
		title: 'Radio en direct',
		body: 'La radio Missionnaire est en direct maintenant\u00a0!',
		url: '/live',
		icon: '/favicon.png'
	};
}

export function youtubeLivePayload(streamTitle: string, streamUrl?: string): PushPayload {
	return {
		title: 'En direct sur YouTube',
		body: streamTitle,
		url: streamUrl || '/videos',
		icon: '/favicon.png'
	};
}
