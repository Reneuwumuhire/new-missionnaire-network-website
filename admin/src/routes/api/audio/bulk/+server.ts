import { objectIdString } from '$lib/server/mongo-input';
import { verifyAdminSession } from '$lib/server/admin-session';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { deleteMusicAudioBulk, bulkUpdateCategory, logAudit } from '../../../../db/collections';
import { getPermissions } from '$lib/models/admin-user';
import { deleteObjects } from '$lib/server/s3';
import type { RequestEvent } from './$types';

const BulkActionSchema = z.discriminatedUnion('action', [
	z.object({
		action: z.literal('delete'),
		ids: z.array(objectIdString).min(1).max(1000)
	}),
	z.object({
		action: z.literal('update_category'),
		ids: z.array(objectIdString).min(1).max(1000),
		category: z.string().min(1)
	})
]);

export async function POST({ request, getClientAddress, cookies }: RequestEvent) {
	const adminUser = await verifyAdminSession(cookies);
	const perms = getPermissions(adminUser);

	try {
		const body = await request.json();
		const parsed = BulkActionSchema.safeParse(body);

		if (parsed.success) {
			if (parsed.data.action === 'delete' && !perms.can_delete) {
				return json({ data: null, error: "Vous n'avez pas la permission de supprimer" }, { status: 403 });
			}
			if (parsed.data.action === 'update_category' && !perms.can_edit) {
				return json({ data: null, error: "Vous n'avez pas la permission de modifier" }, { status: 403 });
			}
		}
		if (!parsed.success) {
			return json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
		}

		const ip = getClientAddress();
		const userId = adminUser._id ?? adminUser.email;

		if (parsed.data.action === 'delete') {
			const { s3_keys } = await deleteMusicAudioBulk(parsed.data.ids);

			try {
				await deleteObjects(s3_keys);
			} catch (s3Error) {
				console.error('Bulk S3 delete error (records already removed from DB):', s3Error);
			}

			await logAudit({
				user_id: userId,
				user_email: adminUser.email,
				action: 'bulk_delete',
				target_collection: 'music_audio',
				target_id: null,
				target_ids: parsed.data.ids,
				ip_address: ip
			});

			return json({
				data: { deleted: parsed.data.ids.length },
				error: null
			});
		}

		if (parsed.data.action === 'update_category') {
			const count = await bulkUpdateCategory(parsed.data.ids, parsed.data.category, adminUser.email);

			await logAudit({
				user_id: userId,
				user_email: adminUser.email,
				action: 'bulk_update',
				target_collection: 'music_audio',
				target_id: null,
				target_ids: parsed.data.ids,
				changes: { category: { old: 'various', new: parsed.data.category } },
				ip_address: ip
			});

			return json({
				data: { updated: count },
				error: null
			});
		}

		return json({ data: null, error: 'Unknown action' }, { status: 400 });
	} catch (error) {
		console.error('Bulk action error:', error);
		return json({ data: null, error: 'Bulk operation failed' }, { status: 500 });
	}
}
