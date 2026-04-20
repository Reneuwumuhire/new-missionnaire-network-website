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
		default_title?: unknown;
		default_description?: unknown;
		default_thumbnail_url?: unknown;
		default_thumbnail_s3_key?: unknown;
	};

	const updates: {
		default_title?: string | null;
		default_description?: string | null;
		default_thumbnail_url?: string | null;
		default_thumbnail_s3_key?: string | null;
	} = {};

	if ('default_title' in body) {
		if (body.default_title === null || body.default_title === '') {
			updates.default_title = null;
		} else if (typeof body.default_title === 'string') {
			const trimmed = body.default_title.trim();
			if (trimmed.length > MAX_TITLE_LEN) {
				throw error(400, `Titre trop long (max ${MAX_TITLE_LEN} caractères)`);
			}
			updates.default_title = trimmed || null;
		} else {
			throw error(400, 'Titre invalide');
		}
	}

	if ('default_description' in body) {
		if (body.default_description === null || body.default_description === '') {
			updates.default_description = null;
		} else if (typeof body.default_description === 'string') {
			const normalized = body.default_description.replaceAll('\r\n', '\n').trim();
			if (normalized.length > MAX_DESCRIPTION_LEN) {
				throw error(400, `Description trop longue (max ${MAX_DESCRIPTION_LEN} caractères)`);
			}
			updates.default_description = normalized || null;
		} else {
			throw error(400, 'Description invalide');
		}
	}

	if ('default_thumbnail_url' in body || 'default_thumbnail_s3_key' in body) {
		if (body.default_thumbnail_url === null && body.default_thumbnail_s3_key === null) {
			updates.default_thumbnail_url = null;
			updates.default_thumbnail_s3_key = null;
		} else if (
			typeof body.default_thumbnail_url === 'string' &&
			typeof body.default_thumbnail_s3_key === 'string' &&
			body.default_thumbnail_url.startsWith('https://') &&
			body.default_thumbnail_s3_key.startsWith('broadcast-thumbnails/')
		) {
			updates.default_thumbnail_url = body.default_thumbnail_url;
			updates.default_thumbnail_s3_key = body.default_thumbnail_s3_key;
		} else {
			throw error(400, 'Données de vignette invalides');
		}
	}

	if (Object.keys(updates).length === 0) {
		throw error(400, 'Aucune modification fournie');
	}

	const current = await getBroadcastAdminState();
	const oldKey = current.default_thumbnail_s3_key;
	const isReplacingThumbnail =
		'default_thumbnail_s3_key' in updates && oldKey && updates.default_thumbnail_s3_key !== oldKey;

	await setBroadcastAdminState(updates);

	if (isReplacingThumbnail) {
		// The current live broadcast may still reference this S3 key (if the
		// admin previously picked the default as the live thumbnail). Only
		// delete if nothing else points at it.
		if (current.thumbnail_s3_key !== oldKey) {
			deleteObject(oldKey).catch((err) =>
				console.error('[broadcast/defaults] old default thumbnail delete failed:', err)
			);
		}
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
