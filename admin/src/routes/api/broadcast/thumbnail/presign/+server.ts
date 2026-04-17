import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { generatePresignedUploadUrl, getS3Url } from '$lib/server/s3';

const ALLOWED_TYPES: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif'
};

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB — plenty for a thumbnail

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const body = (await request.json()) as { contentType?: unknown; size?: unknown };
	const contentType = typeof body.contentType === 'string' ? body.contentType : '';
	const size = typeof body.size === 'number' ? body.size : 0;

	const ext = ALLOWED_TYPES[contentType];
	if (!ext) {
		throw error(400, 'Format d\'image non pris en charge (JPEG, PNG, WebP ou GIF uniquement)');
	}
	if (size > 0 && size > MAX_SIZE_BYTES) {
		throw error(400, `Image trop volumineuse (max ${MAX_SIZE_BYTES / 1024 / 1024} Mo)`);
	}

	// Key prefix sits beside recordings/ and music-audio/ in the same bucket.
	const key = `broadcast-thumbnails/${Date.now()}-${crypto.randomUUID()}.${ext}`;
	const uploadUrl = await generatePresignedUploadUrl(key, contentType);
	const publicUrl = getS3Url(key);

	return json({ uploadUrl, key, publicUrl });
};
