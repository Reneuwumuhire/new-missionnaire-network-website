import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import {
	deleteRecording,
	getRecordingById,
	logAudit,
	updateRecording
} from '../../../../db/collections';
import { deleteObject } from '$lib/server/s3';

export const PATCH: RequestHandler = async ({ locals, params, request, getClientAddress }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const { id } = params;
	if (!id) throw error(400, 'ID manquant');

	const body = (await request.json()) as { title?: unknown; published?: unknown };
	const updates: { title?: string; published?: boolean } = {};
	if (typeof body.title === 'string' && body.title.trim()) updates.title = body.title.trim();
	if (typeof body.published === 'boolean') updates.published = body.published;
	if (Object.keys(updates).length === 0) throw error(400, 'Aucune modification valide');

	const ok = await updateRecording(id, updates);
	if (!ok) throw error(404, 'Enregistrement introuvable');

	await logAudit({
		user_id: locals.user.email,
		user_email: locals.user.email,
		action: 'update',
		target_collection: 'recordings',
		target_id: id,
		changes: Object.fromEntries(
			Object.entries(updates).map(([k, v]) => [k, { old: null, new: v }])
		),
		ip_address: getClientAddress()
	});

	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ locals, params, getClientAddress }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const { id } = params;
	if (!id) throw error(400, 'ID manquant');

	const doc = await getRecordingById(id);
	if (!doc) throw error(404, 'Enregistrement introuvable');

	if (doc.s3_key) {
		try {
			await deleteObject(doc.s3_key);
		} catch (err) {
			console.error('[recordings/delete] S3 delete failed', err);
			throw error(502, 'Suppression S3 impossible — réessayez plus tard');
		}
	}

	await deleteRecording(id);

	await logAudit({
		user_id: locals.user.email,
		user_email: locals.user.email,
		action: 'delete',
		target_collection: 'recordings',
		target_id: id,
		ip_address: getClientAddress()
	});

	return json({ ok: true });
};
