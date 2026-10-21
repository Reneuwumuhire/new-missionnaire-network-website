import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import {
	getBroadcastAdminState,
	getScheduledLiveById,
	restoreScheduledLive,
	logAudit
} from '../../../../../db/collections';

/** Return an ended or cancelled entry to the upcoming schedule, keeping its slug. */
export const POST: RequestHandler = async ({ locals, params, getClientAddress }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const current = await getScheduledLiveById(params.id);
	if (!current) throw error(404, 'Direct programmé introuvable');
	if (current.status !== 'ended' && current.status !== 'cancelled') {
		throw error(400, 'Seul un direct terminé ou annulé peut être restauré');
	}

	const gate = await getBroadcastAdminState({ fresh: true });
	if (gate.is_live && gate.scheduled_live_id === current._id) {
		throw error(409, 'Ce direct est toujours en cours');
	}

	const restored = await restoreScheduledLive(params.id);
	if (!restored) throw error(409, 'Le statut de ce direct a changé. Actualisez la page.');

	await logAudit({
		user_id: locals.user.email,
		user_email: locals.user.email,
		action: 'update',
		target_collection: 'scheduled_lives',
		target_id: params.id,
		changes: {
			status: { old: current.status, new: 'scheduled' },
			live_started_at: { old: current.live_started_at, new: null },
			live_ended_at: { old: current.live_ended_at, new: null },
			recording_id: { old: current.recording_id, new: null }
		},
		ip_address: getClientAddress()
	});

	return json({ ok: true });
};
