import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { RecorderError, recorderStop } from '$lib/server/recorder-client';
import { logAudit } from '../../../../db/collections';

export const POST: RequestHandler = async ({ locals, getClientAddress }) => {
	const user = locals.user;
	if (!getPermissions(user).can_manage_recordings) throw error(403, 'Accès refusé');

	try {
		const result = await recorderStop();
		await logAudit({
			user_id: user.email,
			user_email: user.email,
			action: 'update',
			target_collection: 'recordings',
			target_id: result.id,
			changes: { status: { old: 'recording', new: 'uploading' } },
			ip_address: getClientAddress()
		});
		return json(result);
	} catch (err) {
		if (err instanceof RecorderError) throw error(err.status, err.message);
		throw err;
	}
};
