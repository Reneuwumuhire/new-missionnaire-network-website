import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { generatePresignedUploadUrl, getS3Url } from '$lib/server/s3';

const types: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!getPermissions(locals.user).can_manage_extraits) throw error(403, 'Accès refusé');

	const body = (await request.json().catch(() => ({}))) as {
		contentType?: unknown;
		size?: unknown;
	};
	const contentType = typeof body.contentType === 'string' ? body.contentType : '';
	const size = typeof body.size === 'number' ? body.size : 0;
	const extension = types[contentType];
	if (!extension) throw error(400, 'Utilisez une image JPEG, PNG ou WebP');
	if (!size || size > 8 * 1024 * 1024) throw error(400, 'L’image doit faire moins de 8 Mo');

	// Reuse the already-public thumbnail prefix; no new bucket policy is needed.
	const key = `broadcast-thumbnails/extraits/${Date.now()}-${crypto.randomUUID()}.${extension}`;
	return json({
		uploadUrl: await generatePresignedUploadUrl(key, contentType),
		key,
		publicUrl: getS3Url(key)
	});
};
