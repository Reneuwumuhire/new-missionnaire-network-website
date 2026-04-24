import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import {
	deleteRecording,
	getRecordingById,
	logAudit,
	updateRecording
} from '../../../../db/collections';
import { deleteObject, updateDownloadFilename } from '$lib/server/s3';

const MAX_TITLE_LEN = 200;
const MAX_DESCRIPTION_LEN = 2000;

/** Extract the 11-char YouTube video id from any of the common URL shapes
 *  admins might paste (watch?v=, youtu.be/, /live/, /shorts/, /embed/), or
 *  from the bare 11-char id itself. Returns null for anything we can't
 *  confidently identify. */
function extractYoutubeVideoId(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	// Bare id: [A-Za-z0-9_-]{11}
	if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
	try {
		const u = new URL(trimmed);
		const host = u.hostname.replace(/^www\./, '');
		if (host === 'youtu.be') {
			const id = u.pathname.slice(1).split('/')[0];
			return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
		}
		if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
			const v = u.searchParams.get('v');
			if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
			const m = u.pathname.match(/^\/(?:live|shorts|embed)\/([A-Za-z0-9_-]{11})/);
			if (m) return m[1];
		}
		return null;
	} catch {
		return null;
	}
}

export const PATCH: RequestHandler = async ({ locals, params, request, getClientAddress }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const { id } = params;
	if (!id) throw error(400, 'ID manquant');

	const body = (await request.json()) as {
		title?: unknown;
		published?: unknown;
		description?: unknown;
		thumbnail_url?: unknown;
		thumbnail_s3_key?: unknown;
		youtube_url?: unknown;
	};
	const updates: {
		title?: string;
		published?: boolean;
		description?: string | null;
		thumbnail_url?: string | null;
		thumbnail_s3_key?: string | null;
		source_video_id?: string | null;
	} = {};

	if (typeof body.title === 'string' && body.title.trim()) {
		const trimmed = body.title.trim();
		if (trimmed.length > MAX_TITLE_LEN) {
			throw error(400, `Titre trop long (max ${MAX_TITLE_LEN} caractères)`);
		}
		updates.title = trimmed;
	}

	if (typeof body.published === 'boolean') updates.published = body.published;

	if ('description' in body) {
		if (body.description === null || body.description === '') {
			updates.description = null;
		} else if (typeof body.description === 'string') {
			const normalized = body.description.replaceAll('\r\n', '\n').trim();
			if (normalized.length > MAX_DESCRIPTION_LEN) {
				throw error(400, `Description trop longue (max ${MAX_DESCRIPTION_LEN} caractères)`);
			}
			updates.description = normalized || null;
		} else {
			throw error(400, 'Description invalide');
		}
	}

	if ('youtube_url' in body) {
		if (body.youtube_url === null || body.youtube_url === '') {
			updates.source_video_id = null;
		} else if (typeof body.youtube_url === 'string') {
			const videoId = extractYoutubeVideoId(body.youtube_url);
			if (!videoId) throw error(400, 'URL YouTube invalide');
			updates.source_video_id = videoId;
		} else {
			throw error(400, 'URL YouTube invalide');
		}
	}

	if ('thumbnail_url' in body || 'thumbnail_s3_key' in body) {
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

	if (Object.keys(updates).length === 0) throw error(400, 'Aucune modification valide');

	// If replacing or removing the thumbnail, delete the previous S3 object.
	const isThumbnailChange = 'thumbnail_s3_key' in updates;
	let oldThumbnailKey: string | null = null;
	if (isThumbnailChange) {
		const current = await getRecordingById(id);
		oldThumbnailKey = current?.thumbnail_s3_key ?? null;
	}

	const ok = await updateRecording(id, updates);
	if (!ok) throw error(404, 'Enregistrement introuvable');

	if (isThumbnailChange && oldThumbnailKey && oldThumbnailKey !== updates.thumbnail_s3_key) {
		deleteObject(oldThumbnailKey).catch((err) =>
			console.error('[recordings/patch] old thumbnail delete failed:', err)
		);
	}

	// When the title changes, rewrite the S3 Content-Disposition so future
	// downloads use the new name. Done asynchronously — admins shouldn't wait
	// for S3, and a failure here doesn't invalidate the DB update.
	if (updates.title) {
		const current = await getRecordingById(id);
		if (current?.s3_key) {
			updateDownloadFilename(current.s3_key, updates.title).catch((err) =>
				console.error('[recordings/patch] Content-Disposition update failed:', err)
			);
		}
	}

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
