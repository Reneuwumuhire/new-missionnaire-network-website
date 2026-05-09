import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { probeLiveAudio, getLiveAudioSourceUrl, applyAutoEndSafety } from '$lib/server/live-audio';
import { sendPushToAll, radioLivePayload } from '$lib/server/push-notifications';
import { checkAndIngestLiveStream } from '$lib/server/youtube-poller';
import {
	getBroadcastAdminState,
	setBroadcastAdminState,
	getRadioCachedStatus,
	setRadioCachedStatus
} from '../../../../db/collections';

// Vercel Cron entry point. Replaces the user-driven Icecast probing that
// used to live in /api/live/radio-poll.
//
// ── Schedules (see vercel.json `crons`) ──────────────────────────
// 1. Scheduled broadcasts — every minute during the regular slots, for fast
//    auto-end response. Windows widened to span both CET/CEST so the schedule
//    stays correct across DST without redeploying:
//      Wednesday 18:00–22:00 Berlin → cron `* 16-21 * * 3` UTC
//      Saturday  18:00–22:00 Berlin → cron `* 16-21 * * 6` UTC
//      Sunday    08:00–12:00 Berlin → cron `* 6-11 * * 0`  UTC
//
// 2. Ad-hoc fallback — every 5 minutes year-round (`*/5 * * * *`). This is
//    the safety net for admin-triggered live events outside the regular
//    schedule. Auto-end fires within ~5 min + the configured grace window
//    (default 5 min, see ICECAST_OFFLINE_AUTO_END_MS).
//
// The handler short-circuits with a single DB read when the admin gate is
// closed, so the ~2k/week always-on ticks are essentially free. Overlapping
// invocations during a scheduled minute (windowed + fallback hitting at the
// same time) are harmless — the writes are idempotent.
//
// Auth: Vercel injects `Authorization: Bearer ${CRON_SECRET}` on cron
// invocations. We require that header to keep the endpoint from being abused
// as a free load-generator against Icecast.

function authorized(request: Request): boolean {
	const cronSecret = env.CRON_SECRET;
	if (!cronSecret) {
		// Treat missing secret as a misconfiguration — fail closed in prod.
		console.warn('[CronRadioProbe] CRON_SECRET not configured — denying request');
		return false;
	}
	const header = request.headers.get('authorization') || '';
	return header === `Bearer ${cronSecret}`;
}

export async function GET({ request }) {
	if (!authorized(request)) throw error(401, 'Unauthorized');

	let adminGate = await getBroadcastAdminState();

	// Backstop consumer: if the admin → main-site internal-event ping failed,
	// the notification_pending flag will still be set. Fire the push from here.
	// Cleared first to keep the operation idempotent across cron retries.
	if (adminGate.is_live && adminGate.notification_pending) {
		await setBroadcastAdminState({ notification_pending: false });
		adminGate = { ...adminGate, notification_pending: false };
		console.log('[CronRadioProbe] Backstop: firing pending Go Live push');
		sendPushToAll(radioLivePayload({ thumbnailUrl: adminGate.thumbnail_url })).catch((e) =>
			console.error('[CronRadioProbe] Backstop push send failed:', e)
		);
	}

	// Fast path: gate closed → no point probing Icecast. Single DB read, done.
	if (!adminGate.is_live) {
		return json({ ok: true, probed: false, reason: 'gate-closed' });
	}

	// Gate open → probe Icecast and apply auto-end safety.
	let probedIsLive = false;
	let probeError: string | null = null;
	try {
		const probe = await probeLiveAudio(fetch);
		probedIsLive = probe.isLive;

		const previous = await getRadioCachedStatus();
		const newStatus = {
			isLive: probe.isLive,
			checkedAt: new Date().toISOString(),
			streamUrl: probe.isLive ? getLiveAudioSourceUrl() : undefined
		};
		await setRadioCachedStatus(newStatus);

		const wasLive = previous?.isLive ?? false;
		if (newStatus.isLive && !wasLive) {
			console.log('[CronRadioProbe] Icecast: LIVE');
			// YouTube probably started too — bypass throttle.
			checkAndIngestLiveStream(true).catch((e) =>
				console.error('[CronRadioProbe] YouTube check failed:', e)
			);
		} else if (!newStatus.isLive && wasLive) {
			console.log('[CronRadioProbe] Icecast: OFFLINE');
		}
	} catch (e) {
		probeError = e instanceof Error ? e.message : 'probe failed';
		console.error('[CronRadioProbe] Probe error:', e);
	}

	const updatedGate = await applyAutoEndSafety(adminGate, probedIsLive);

	return json({
		ok: true,
		probed: true,
		icecastLive: probedIsLive,
		gateClosedBySafety: adminGate.is_live && !updatedGate.is_live,
		error: probeError
	});
}
