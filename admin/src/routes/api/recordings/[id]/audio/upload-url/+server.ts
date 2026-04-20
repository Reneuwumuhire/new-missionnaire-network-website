import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { getRecordingById } from '../../../../../../db/collections';
import { generatePresignedUploadUrl, getS3Url } from '$lib/server/s3';

const ALLOWED_CONTENT_TYPES = new Set(['audio/mpeg', 'audio/mp3']);

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const { id } = params;
	if (!id) throw error(400, 'ID manquant');

	const rec = await getRecordingById(id);
	if (!rec) throw error(404, 'Enregistrement introuvable');

	const body = (await request.json()) as { contentType?: unknown };
	const contentType = typeof body.contentType === 'string' ? body.contentType : '';
	if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
		throw error(400, 'Type de fichier non autorisé (MP3 uniquement)');
	}

	// Use a timestamped key so the new file has a different URL from the old —
	// breaks any immutable browser/CDN caches pointing at the old audio.
	const s3Key = `recordings/${id}-${Date.now()}.mp3`;
	const uploadUrl = await generatePresignedUploadUrl(s3Key, contentType);

	return json({ uploadUrl, s3Key, s3Url: getS3Url(s3Key) });
};
