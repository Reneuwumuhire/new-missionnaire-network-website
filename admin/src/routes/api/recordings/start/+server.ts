import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { RecorderError, recorderStart } from '$lib/server/recorder-client';
import { logAudit } from '../../../../db/collections';

export const POST: RequestHandler = async ({ locals, getClientAddress }) => {
	const user = locals.user;
	if (!getPermissions(user).can_manage_recordings) throw error(403, 'Accès refusé');

	try {
		const result = await recorderStart(user.email, user.name || null);
		await logAudit({
			user_id: user.email,
			user_email: user.email,
			action: 'create',
			target_collection: 'recordings',
			target_id: result.id,
			ip_address: getClientAddress()
		});
		return json(result);
	} catch (err) {
		if (err instanceof RecorderError) throw error(err.status, err.message);
		throw err;
	}
};
