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
	if (!current.is_live) {
		return json({ ok: true, alreadyOffline: true, state: current });
	}

	const endedAt = new Date().toISOString();
	await setBroadcastAdminState({
		is_live: false,
		ended_at: endedAt,
		icecast_offline_since: null,
		notification_pending: false
	});

	// Track when the admin ending the broadcast is not the same admin who
	// started it — soft lock: we don't block, but we surface it in the audit log.
	const startedBy = current.started_by ?? null;
	const isOverride = Boolean(startedBy) && startedBy !== locals.user.email;

	await logAudit({
		user_id: locals.user.email,
		user_email: locals.user.email,
		action: 'update',
		target_collection: 'broadcast_admin_state',
		target_id: 'current',
		changes: {
			is_live: { old: true, new: false },
			...(isOverride ? { override_started_by: { old: startedBy, new: null } } : {})
		},
		ip_address: getClientAddress()
	});

	return json({ ok: true, endedAt });
};
