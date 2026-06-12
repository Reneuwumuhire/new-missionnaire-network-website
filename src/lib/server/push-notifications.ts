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
	/** Notification tag — notifications sharing a tag REPLACE each other on
	 *  the device instead of stacking. All radio events share one tag so a
	 *  repeated go-live (admin restart, cron backstop double-fire) or the
	 *  later "diffusion terminée" update the same card. Older SW builds fall
	 *  back to tagging by `url`. */
	tag?: string;
	// Discriminator the Service Worker forwards to open tabs as the message
	// payload. Clients use this to decide how to update local state — flipping
	// the radio "is live" indicator on/off without doing a network round-trip.
	// Tabs ignore events they don't handle, so adding kinds here is safe
	// without a Service Worker change.
	event?: 'radio-live' | 'radio-end' | 'live-scheduled' | 'live-reminder';
}

// One tag for the whole live/radio lifecycle (announcement → reminder →
// go-live → end): each phase replaces the previous notification, so a
// subscriber never accumulates a stack of cards for the same broadcast.
const RADIO_TAG = 'mn-radio-live';

// Notification bodies get truncated by the OS anyway; clamping here keeps the
// web-push payload comfortably inside the 4 KB limit even with long
// admin-written descriptions.
function clampBody(text: string, limit = 160): string {
	const clean = text.replace(/\s+/g, ' ').trim();
	if (clean.length <= limit) return clean;
	return `${clean.slice(0, limit - 1).trimEnd()}…`;
}

// Only attach `image` when it's an absolute HTTPS URL — web-push silently
// drops anything else, and a broken image URL can suppress the whole
// notification on some Android builds. Raw S3 thumbnails run ~700 KB PNG, so
// route them through Vercel Image Optimization on the production origin
// (same trick as the /live og:image — w=1080 is an allowed size in
// svelte.config's images.sizes) for a fast, data-friendly download.
function notificationImage(thumb: string | null | undefined): string | undefined {
	if (!thumb || !/^https:\/\//i.test(thumb)) return undefined;
	return `https://missionnaire.net/_vercel/image?url=${encodeURIComponent(thumb)}&w=1080&q=50`;
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

export function radioLivePayload(opts?: {
	/** Broadcast title from broadcast_admin_state \u2014 surfaces WHAT is live in
	 *  the notification itself instead of a generic "Audio en direct". */
	broadcastTitle?: string | null;
	/** Broadcast description \u2014 used as the notification body when present. */
	broadcastDescription?: string | null;
	thumbnailUrl?: string | null;
	/** Stable watch URL (/live/<slug>) when the broadcast is linked to a
	 *  scheduled live \u2014 deep-links the notification to the watch page so the
	 *  same URL later resolves to the replay. */
	watchPath?: string | null;
}): PushPayload {
	const broadcastTitle = opts?.broadcastTitle?.trim();
	const broadcastDescription = opts?.broadcastDescription?.trim();
	const payload: PushPayload = {
		// Lead with the broadcast's real title so the lock-screen card is
		// informative on its own; sensible generic copy when admin left it blank.
		title: broadcastTitle ? `\u{1F534} En direct\u00a0: ${clampBody(broadcastTitle, 80)}` : 'Audio en direct',
		body: broadcastDescription
			? clampBody(broadcastDescription)
			: 'Missionnaire Network est en direct audio maintenant\u00a0!',
		url: opts?.watchPath || '/live',
		icon: '/favicon.png',
		tag: RADIO_TAG,
		event: 'radio-live'
	};
	const image = notificationImage(opts?.thumbnailUrl);
	if (image) payload.image = image;
	return payload;
}

export function radioEndPayload(opts?: { broadcastTitle?: string | null }): PushPayload {
	const broadcastTitle = opts?.broadcastTitle?.trim();
	return {
		title: 'Diffusion termin\u00e9e',
		body: broadcastTitle
			? `\u00ab\u00a0${clampBody(broadcastTitle, 80)}\u00a0\u00bb est termin\u00e9e. La rediffusion arrive bient\u00f4t sur le site.`
			: 'La diffusion en direct est maintenant termin\u00e9e.',
		// Land listeners where the replay will appear rather than the homepage.
		url: '/live',
		icon: '/favicon.png',
		// Same tag as the go-live push \u2014 REPLACES the "En direct" card instead
		// of stacking a second notification for the same broadcast.
		tag: RADIO_TAG,
		event: 'radio-end'
	};
}

// Broadcasts are announced/scheduled in Berlin/Zurich time (see the radio-probe
// cron schedule) \u2014 format the push body in that zone, not the server's.
function formatScheduledDateFr(scheduledAtIso: string): string {
	try {
		return new Intl.DateTimeFormat('fr-FR', {
			timeZone: 'Europe/Zurich',
			dateStyle: 'full',
			timeStyle: 'short'
		}).format(new Date(scheduledAtIso));
	} catch {
		return scheduledAtIso;
	}
}

// Time-only variant for the "starts soon" reminder — the live begins within
// the half hour, so repeating the full date is noise.
function formatScheduledTimeFr(scheduledAtIso: string): string {
	try {
		return new Intl.DateTimeFormat('fr-FR', {
			timeZone: 'Europe/Zurich',
			hour: '2-digit',
			minute: '2-digit'
		}).format(new Date(scheduledAtIso));
	} catch {
		return scheduledAtIso;
	}
}

/** Announcement fired when an admin schedules a live with "annoncer aux
 *  abonn\u00e9s" \u2014 deep-links straight to the waiting room. */
export function liveScheduledPayload(opts: {
	title: string;
	scheduledAtIso: string;
	slug: string;
	thumbnailUrl?: string | null;
}): PushPayload {
	const payload: PushPayload = {
		title: 'Direct \u00e0 venir',
		body: clampBody(`\u00ab\u00a0${opts.title}\u00a0\u00bb \u2014 ${formatScheduledDateFr(opts.scheduledAtIso)}`),
		url: `/live/${opts.slug}`,
		icon: '/favicon.png',
		// Per-broadcast tag: the later "starts soon" reminder replaces this
		// announcement instead of stacking next to it.
		tag: `mn-live-${opts.slug}`,
		event: 'live-scheduled'
	};
	const image = notificationImage(opts.thumbnailUrl);
	if (image) payload.image = image;
	return payload;
}

/** Reminder fired by the cron shortly before a scheduled live starts. */
export function liveReminderPayload(opts: {
	title: string;
	scheduledAtIso: string;
	slug: string;
	thumbnailUrl?: string | null;
}): PushPayload {
	const payload: PushPayload = {
		title: 'Le direct commence bient\u00f4t',
		body: clampBody(`\u00ab\u00a0${opts.title}\u00a0\u00bb commence \u00e0 ${formatScheduledTimeFr(opts.scheduledAtIso)}.`),
		url: `/live/${opts.slug}`,
		icon: '/favicon.png',
		// Replaces the earlier announcement card for this same broadcast.
		tag: `mn-live-${opts.slug}`,
		event: 'live-reminder'
	};
	const image = notificationImage(opts.thumbnailUrl);
	if (image) payload.image = image;
	return payload;
}

