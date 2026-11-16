import { verifyAdminSession } from '$lib/server/admin-session';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { getScheduledLiveById, setScheduledLiveStatus, logAudit } from '../../../../../db/collections';

export const POST: RequestHandler = async ({ params, getClientAddress, cookies }) => {
	const adminUser = await verifyAdminSession(cookies);
	if (!getPermissions(adminUser).can_manage_recordings) throw error(403, 'Accès refusé');

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
		user_id: adminUser.email,
		user_email: adminUser.email,
		action: 'update',
		target_collection: 'scheduled_lives',
		target_id: params.id,
		changes: { status: { old: current.status, new: 'cancelled' } },
		ip_address: getClientAddress()
	});

	return json({ ok: true });
};
