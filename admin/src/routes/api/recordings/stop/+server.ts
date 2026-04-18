import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { RecorderError, recorderStatus, recorderStop } from '$lib/server/recorder-client';
import { logAudit } from '../../../../db/collections';

export const POST: RequestHandler = async ({ locals, getClientAddress }) => {
	const user = locals.user;
	if (!getPermissions(user).can_manage_recordings) throw error(403, 'Accès refusé');

	// Capture who started the recording before we stop it — used to flag
	// override actions in the audit log (soft lock, no blocking).
	const startedBy = await recorderStatus()
		.then((s) => (s.recording ? (s.createdBy ?? null) : null))
		.catch(() => null);

	try {
		const result = await recorderStop();
		const isOverride = Boolean(startedBy) && startedBy !== user.email;
		await logAudit({
			user_id: user.email,
			user_email: user.email,
			action: 'update',
			target_collection: 'recordings',
			target_id: result.id,
			changes: {
				status: { old: 'recording', new: 'uploading' },
				...(isOverride ? { override_started_by: { old: startedBy, new: null } } : {})
			},
			ip_address: getClientAddress()
		});
		return json(result);
	} catch (err) {
		if (err instanceof RecorderError) throw error(err.status, err.message);
		throw err;
	}
};
