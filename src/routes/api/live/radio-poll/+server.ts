import { json } from '@sveltejs/kit';
import { getLiveAudioSourceUrl } from '$lib/server/live-audio';
import {
	getRadioCachedStatus,
	getBroadcastAdminState,
	countActiveListeners,
	heartbeatListener,
	removeListener
} from '../../../../db/collections';

// DEPRECATED. Live-status polling moved to push-driven updates:
// - /api/live/radio-state — pure state read (one-shot on page load)
// - /api/live/radio-listener — listener heartbeat (only while audio plays)
// - /api/cron/radio-probe — server-side Icecast probe (every 60s, replaces user polls)
// - /api/internal/broadcast-event — admin → main-site push trigger
//
// This route is kept as a compat shim so already-loaded clients (especially
// SW-cached bundles from before the migration) don't break. It now does
// **no** Icecast probe, **no** push trigger, **no** auto-end work — those
// run server-side on the cron. Remove this route once stale clients have
// drained (≥7 days post-deploy).

let deprecationWarnedAt = 0;
function warnDeprecated() {
	const now = Date.now();
	if (now - deprecationWarnedAt < 60_000) return;
	deprecationWarnedAt = now;
	console.warn(
		'[RadioPoll] Deprecated endpoint hit — clients should use /api/live/radio-state and /api/live/radio-listener'
	);
}

export async function GET({ url, setHeaders }) {
	warnDeprecated();
	setHeaders({
		'Cache-Control': 'no-store, no-cache, must-revalidate',
		Pragma: 'no-cache'
	});

	const sid = url.searchParams.get('sid');
	if (sid) {
		heartbeatListener(sid).catch(() => {});
	}

	const [status, adminGate] = await Promise.all([getRadioCachedStatus(), getBroadcastAdminState()]);

	let listeners = 0;
	try {
		listeners = await countActiveListeners();
	} catch {
		// DB unavailable
	}

	const icecastLive = status?.isLive ?? false;
	const isLive = icecastLive && adminGate.is_live;

	return json({
		isLive,
		checkedAt: status?.checkedAt ?? new Date().toISOString(),
		listeners,
		streamUrl: isLive ? (status?.streamUrl ?? getLiveAudioSourceUrl()) : undefined,
		title: adminGate.title,
		description: adminGate.description,
		thumbnailUrl: adminGate.thumbnail_url
	});
}

// Legacy disconnect beacons. New clients post to /api/live/radio-listener.
export async function DELETE({ url }) {
	warnDeprecated();
	const sid = url.searchParams.get('sid');
	if (sid) {
		await removeListener(sid).catch(() => {});
	}
	return json({ ok: true });
}
