import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { getScheduledLiveById, setScheduledLiveStatus, logAudit } from '../../../../../db/collections';

export const POST: RequestHandler = async ({ locals, params, getClientAddress }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const current = await getScheduledLiveById(params.id);
	if (!current) throw error(404, 'Direct programmé introuvable');
	if (current.status === 'live') {
		throw error(400, 'Impossible d’annuler un direct en cours — arrêtez-le d’abord');
	}
	if (current.status === 'cancelled') {
		return json({ ok: true, alreadyCancelled: true });
	}

	await setScheduledLiveStatus(params.id, 'cancelled');

	await logAudit({
		user_id: locals.user.email,
		user_email: locals.user.email,
		action: 'update',
		target_collection: 'scheduled_lives',
		target_id: params.id,
		changes: { status: { old: current.status, new: 'cancelled' } },
		ip_address: getClientAddress()
	});

	return json({ ok: true });
};
