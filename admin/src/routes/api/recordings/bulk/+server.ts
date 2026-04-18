import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestEvent } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { deleteObjects } from '$lib/server/s3';
import { deleteRecordingBulk, logAudit } from '../../../../db/collections';

const BulkActionSchema = z.discriminatedUnion('action', [
	z.object({
		action: z.literal('delete'),
		ids: z.array(z.string()).min(1)
	})
]);

export async function POST({ request, locals, getClientAddress }: RequestEvent) {
	const perms = getPermissions(locals.user);
	if (!perms.can_manage_recordings) {
		return json({ data: null, error: 'Accès refusé' }, { status: 403 });
	}

	const body = await request.json().catch(() => null);
	const parsed = BulkActionSchema.safeParse(body);
	if (!parsed.success) {
		return json({ data: null, error: parsed.error.issues[0]?.message ?? 'Requête invalide' }, { status: 400 });
	}

	try {
		const { deleted, s3_keys } = await deleteRecordingBulk(parsed.data.ids);

		// Best-effort S3 cleanup. DB rows are already gone — an S3 failure
		// leaves orphan objects but does not roll back the user-visible delete.
		if (s3_keys.length > 0) {
			try {
				await deleteObjects(s3_keys);
			} catch (err) {
				console.error('[recordings/bulk] S3 cleanup failed (rows already removed):', err);
			}
		}

		await logAudit({
			user_id: locals.user.email,
			user_email: locals.user.email,
			action: 'bulk_delete',
			target_collection: 'recordings',
			target_id: null,
			target_ids: parsed.data.ids,
			ip_address: getClientAddress()
		});

		return json({ data: { deleted }, error: null });
	} catch (err) {
		console.error('[recordings/bulk] delete failed:', err);
		return json({ data: null, error: 'Suppression en masse échouée' }, { status: 500 });
	}
}
