import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { getScheduledLiveById, setScheduledLiveStatus, logAudit } from '../../../../../db/collections';

// Force-end a scheduled live that is stuck on status 'live' while the broadcast
// gate is already offline (e.g. the stream stopped and the auto-end safety
// closed the gate without transitioning the entry, or any other strand). The
// active-broadcast case goes through /api/broadcast/end-live instead, which
// also closes the gate; here there is no gate to close — we just reconcile the
// entry so it leaves the "upcoming" list.
export const POST: RequestHandler = async ({ locals, params, getClientAddress }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const current = await getScheduledLiveById(params.id);
	if (!current) throw error(404, 'Direct programmé introuvable');
	if (current.status !== 'live') {
		// Idempotent: already ended/cancelled/scheduled — nothing to close.
		return json({ ok: true, notLive: true, status: current.status });
	}

	const endedAt = new Date().toISOString();
	await setScheduledLiveStatus(params.id, 'ended', { live_ended_at: endedAt });

	await logAudit({
		user_id: locals.user.email,
		user_email: locals.user.email,
		action: 'update',
		target_collection: 'scheduled_lives',
		target_id: params.id,
		changes: { status: { old: 'live', new: 'ended' } },
		ip_address: getClientAddress()
	});

	return json({ ok: true, endedAt });
};
