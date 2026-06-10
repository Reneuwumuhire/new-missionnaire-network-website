import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { generatePresignedUploadUrl, getS3Url } from '$lib/server/s3';

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB — a multi-hour SRT is well under 500 KB

// Browsers report inconsistent MIME types for .srt ('' / application/x-subrip /
// text/plain), so the type is fixed server-side and returned to the client,
// which must PUT with the identical header for the signature to match.
const SRT_CONTENT_TYPE = 'text/plain; charset=utf-8';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const body = (await request.json()) as { filename?: unknown; size?: unknown };
	const filename = typeof body.filename === 'string' ? body.filename : '';
	const size = typeof body.size === 'number' ? body.size : 0;

	if (!filename.toLowerCase().endsWith('.srt')) {
		throw error(400, 'Seuls les fichiers .srt sont pris en charge');
	}
	if (size > 0 && size > MAX_SIZE_BYTES) {
		throw error(400, `Fichier trop volumineux (max ${MAX_SIZE_BYTES / 1024 / 1024} Mo)`);
	}

	// Key prefix sits beside broadcast-thumbnails/ in the same bucket. Public
	// GET is granted by a bucket policy on subtitles/* (not a per-object ACL).
	// Keys are unique per upload, so replacing an SRT yields a new URL and
	// long-lived caches can never go stale.
	const key = `subtitles/${Date.now()}-${crypto.randomUUID()}.srt`;
	const uploadUrl = await generatePresignedUploadUrl(key, SRT_CONTENT_TYPE);
	const publicUrl = getS3Url(key);

	return json({ uploadUrl, key, publicUrl, contentType: SRT_CONTENT_TYPE });
};
