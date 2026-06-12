import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
	sendPushToAll,
	radioLivePayload,
	radioEndPayload,
	liveScheduledPayload
} from '$lib/server/push-notifications';
import {
	getBroadcastAdminState,
	setBroadcastAdminState,
	setRadioCachedStatus,
	claimScheduledLiveAnnouncement
} from '../../../../db/collections';

// Internal cross-service endpoint. The admin app calls this immediately after
// flipping `broadcast_admin_state.is_live = true` so the user push fires within
// ~1s of the admin click instead of waiting for the cron (which still serves as
// a backstop in case this endpoint is unreachable).
//
// Auth: shared `INTERNAL_API_SECRET` between admin and main site.

type BroadcastEventBody = {
	event?: 'go-live' | 'end-live' | 'live-scheduled';
	/** For 'live-scheduled': the scheduled_lives entry being announced. */
	scheduledLiveId?: string;
};

function authorized(request: Request): boolean {
	const secret = env.INTERNAL_API_SECRET;
	if (!secret) {
		console.warn('[BroadcastEvent] INTERNAL_API_SECRET not configured — denying request');
		return false;
	}
	const header = request.headers.get('authorization') || '';
	return header === `Bearer ${secret}`;
}

export async function POST({ request }) {
	if (!authorized(request)) throw error(401, 'Unauthorized');

	let body: BroadcastEventBody = {};
	try {
		body = (await request.json()) as BroadcastEventBody;
	} catch {
		// Empty body → treat as default (no event).
	}

	const event = body.event;
	if (event !== 'go-live' && event !== 'end-live' && event !== 'live-scheduled') {
		throw error(400, 'event must be "go-live", "end-live" or "live-scheduled"');
	}

	if (event === 'live-scheduled') {
		// Announce an upcoming live. The atomic claim (announce_pending flips
		// false) makes duplicate pings — admin retry racing the cron backstop —
		// no-ops, same idempotency as notification_pending below.
		if (!body.scheduledLiveId) throw error(400, 'scheduledLiveId required');
		const live = await claimScheduledLiveAnnouncement(body.scheduledLiveId);
		if (!live) {
			return json({ ok: true, fired: false, reason: 'no-pending-announcement' });
		}
		try {
			await sendPushToAll(
				liveScheduledPayload({
					title: live.title,
					scheduledAtIso: live.scheduled_at,
					slug: live.slug,
					thumbnailUrl: live.thumbnail_url
				})
			);
		} catch (e) {
			console.error('[BroadcastEvent] sendPushToAll (live-scheduled) failed:', e);
			return json({ ok: false, fired: false, error: 'push-failed' }, { status: 502 });
		}
		return json({ ok: true, fired: true });
	}

	if (event === 'go-live') {
		// Re-read fresh so a duplicate ping (e.g. retried from admin) is a no-op.
		const gate = await getBroadcastAdminState();
		if (!gate.is_live || !gate.notification_pending) {
			return json({ ok: true, fired: false, reason: 'no-pending-notification' });
		}
		// Clear the flag BEFORE sending so a concurrent cron tick doesn't double-fire.
		await setBroadcastAdminState({ notification_pending: false });
		try {
			await sendPushToAll(
				radioLivePayload({
					// Surface the broadcast's real title/description in the
					// notification so the lock-screen card says WHAT is live.
					broadcastTitle: gate.title,
					broadcastDescription: gate.description,
					thumbnailUrl: gate.thumbnail_url,
					// Deep-link to the stable watch page when this broadcast is
					// linked to a scheduled live — that URL keeps working after the
					// live ends (redirects to the replay).
					watchPath: gate.scheduled_live_slug ? `/live/${gate.scheduled_live_slug}` : null
				})
			);
		} catch (e) {
			console.error('[BroadcastEvent] sendPushToAll failed:', e);
			// Best-effort: leave the flag cleared. Admin can re-trigger if needed.
			return json({ ok: false, fired: false, error: 'push-failed' }, { status: 502 });
		}
		return json({ ok: true, fired: true });
	}

	// end-live: clear the cached Icecast status so any visitor whose page
	// hasn't refreshed since admin clicked "End Live" sees `isLive: false` on
	// next SSR / API read, then fan out an "end" push. Open tabs flip the
	// radio store off via the SW broadcast — no reload needed.
	await setRadioCachedStatus({
		isLive: false,
		checkedAt: new Date().toISOString(),
		streamUrl: undefined
	});
	try {
		// Re-read the gate so the "terminée" card can name the broadcast that
		// just ended (title usually survives the is_live flip).
		const endedGate = await getBroadcastAdminState().catch(() => null);
		await sendPushToAll(radioEndPayload({ broadcastTitle: endedGate?.title ?? null }));
	} catch (e) {
		console.error('[BroadcastEvent] sendPushToAll (end) failed:', e);
		return json({ ok: false, fired: false, error: 'push-failed' }, { status: 502 });
	}
	return json({ ok: true, fired: true });
}
