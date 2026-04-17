import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import {
	getBroadcastAdminState,
	setBroadcastAdminState,
	logAudit
} from '../../../../db/collections';

export const POST: RequestHandler = async ({ locals, getClientAddress }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const current = await getBroadcastAdminState();
	if (current.is_live) {
		// Idempotent: already live → just return current state without re-firing the push.
		return json({ ok: true, alreadyLive: true, state: current });
	}

	const startedAt = new Date().toISOString();
	await setBroadcastAdminState({
		is_live: true,
		started_at: startedAt,
		ended_at: null,
		started_by: locals.user.email,
		icecast_offline_since: null,
		// Picked up by the main-site radio-poll endpoint, which fires the actual
		// push notification (VAPID keys + web-push live there, not in admin).
		notification_pending: true
	});

	await logAudit({
		user_id: locals.user.email,
		user_email: locals.user.email,
		action: 'create',
		target_collection: 'broadcast_admin_state',
		target_id: 'current',
		changes: { is_live: { old: false, new: true } },
		ip_address: getClientAddress()
	});

	return json({ ok: true, startedAt });
};
