import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import {
	getBroadcastAdminState,
	setBroadcastAdminState,
	logAudit
} from '../../../../db/collections';
import { deleteObject } from '$lib/server/s3';

const MAX_TITLE_LEN = 120;
const MAX_DESCRIPTION_LEN = 2000;

export const PATCH: RequestHandler = async ({ locals, request, getClientAddress }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const body = (await request.json()) as {
		title?: unknown;
		description?: unknown;
		thumbnail_url?: unknown;
		thumbnail_s3_key?: unknown;
	};

	const updates: {
		title?: string | null;
		description?: string | null;
		thumbnail_url?: string | null;
		thumbnail_s3_key?: string | null;
	} = {};

	if ('title' in body) {
		if (body.title === null || body.title === '') {
			updates.title = null;
		} else if (typeof body.title === 'string') {
			const trimmed = body.title.trim();
			if (trimmed.length > MAX_TITLE_LEN) {
				throw error(400, `Titre trop long (max ${MAX_TITLE_LEN} caractères)`);
			}
			updates.title = trimmed || null;
		} else {
			throw error(400, 'Titre invalide');
		}
	}

	if ('description' in body) {
		if (body.description === null || body.description === '') {
			updates.description = null;
		} else if (typeof body.description === 'string') {
			// Normalize line endings but preserve paragraph breaks.
			const normalized = body.description.replaceAll('\r\n', '\n').trim();
			if (normalized.length > MAX_DESCRIPTION_LEN) {
				throw error(400, `Description trop longue (max ${MAX_DESCRIPTION_LEN} caractères)`);
			}
			updates.description = normalized || null;
		} else {
			throw error(400, 'Description invalide');
		}
	}

	if ('thumbnail_url' in body || 'thumbnail_s3_key' in body) {
		// Both must come together (either set or clear)
		if (body.thumbnail_url === null && body.thumbnail_s3_key === null) {
			updates.thumbnail_url = null;
			updates.thumbnail_s3_key = null;
		} else if (
			typeof body.thumbnail_url === 'string' &&
			typeof body.thumbnail_s3_key === 'string' &&
			body.thumbnail_url.startsWith('https://') &&
			body.thumbnail_s3_key.startsWith('broadcast-thumbnails/')
		) {
			updates.thumbnail_url = body.thumbnail_url;
			updates.thumbnail_s3_key = body.thumbnail_s3_key;
		} else {
			throw error(400, 'Données de vignette invalides');
		}
	}

	if (Object.keys(updates).length === 0) {
		throw error(400, 'Aucune modification fournie');
	}

	// If we're replacing or clearing the thumbnail, delete the old S3 object.
	const current = await getBroadcastAdminState();
	const oldKey = current.thumbnail_s3_key;
	const isReplacingThumbnail =
		'thumbnail_s3_key' in updates && oldKey && updates.thumbnail_s3_key !== oldKey;
	// Don't delete the old key if it's still referenced by the stored default
	// thumbnail — otherwise future "Use defaults" clicks would 404.
	const oldKeyStillInUse = oldKey && oldKey === current.default_thumbnail_s3_key;

	await setBroadcastAdminState(updates);

	if (isReplacingThumbnail && !oldKeyStillInUse) {
		// Best-effort cleanup — don't fail the request if S3 delete fails.
		deleteObject(oldKey).catch((err) =>
			console.error('[broadcast/metadata] old thumbnail delete failed:', err)
		);
	}

	await logAudit({
		user_id: locals.user.email,
		user_email: locals.user.email,
		action: 'update',
		target_collection: 'broadcast_admin_state',
		target_id: 'current',
		changes: Object.fromEntries(
			Object.entries(updates).map(([k, v]) => [k, { old: null, new: v }])
		),
		ip_address: getClientAddress()
	});

	return json({ ok: true, updates });
};
