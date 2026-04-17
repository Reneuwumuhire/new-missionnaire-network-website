import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { RecorderError, recorderRetry } from '$lib/server/recorder-client';
import { logAudit } from '../../../../../db/collections';

export const POST: RequestHandler = async ({ locals, params, getClientAddress }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const { id } = params;
	if (!id) throw error(400, 'ID manquant');

	try {
		const result = await recorderRetry(id);
		await logAudit({
			user_id: locals.user.email,
			user_email: locals.user.email,
			action: 'update',
			target_collection: 'recordings',
			target_id: id,
			changes: { retry: { old: 'failed', new: 'ready' } },
			ip_address: getClientAddress()
		});
		return json(result);
	} catch (err) {
		if (err instanceof RecorderError) throw error(err.status, err.message);
		throw err;
	}
};
