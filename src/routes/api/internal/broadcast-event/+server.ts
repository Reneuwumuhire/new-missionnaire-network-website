import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { sendPushToAll, radioLivePayload } from '$lib/server/push-notifications';
import { getBroadcastAdminState, setBroadcastAdminState } from '../../../../db/collections';

// Internal cross-service endpoint. The admin app calls this immediately after
// flipping `broadcast_admin_state.is_live = true` so the user push fires within
// ~1s of the admin click instead of waiting for the cron (which still serves as
// a backstop in case this endpoint is unreachable).
//
// Auth: shared `INTERNAL_API_SECRET` between admin and main site.

type BroadcastEventBody = {
	event?: 'go-live' | 'end-live';
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
	if (event !== 'go-live' && event !== 'end-live') {
		throw error(400, 'event must be "go-live" or "end-live"');
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
			await sendPushToAll(radioLivePayload({ thumbnailUrl: gate.thumbnail_url }));
		} catch (e) {
			console.error('[BroadcastEvent] sendPushToAll failed:', e);
			// Best-effort: leave the flag cleared. Admin can re-trigger if needed.
			return json({ ok: false, fired: false, error: 'push-failed' }, { status: 502 });
		}
		return json({ ok: true, fired: true });
	}

	// end-live: reserved for future use (e.g. "stream ended" push). No-op for now.
	return json({ ok: true, fired: false, reason: 'end-live-no-op' });
}
