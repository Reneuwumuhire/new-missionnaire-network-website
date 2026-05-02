import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { generatePresignedUploadUrl, generateS3Key, getS3Url } from '$lib/server/s3';
import { getPermissions } from '$lib/models/admin-user';
import type { RequestEvent } from './$types';

const UploadUrlSchema = z.object({
	fileName: z.string().min(1),
	contentType: z.string().min(1),
	category: z.string().min(1)
});

export async function POST({ locals, request }: RequestEvent) {
	if (!getPermissions(locals.user).can_add) {
		return json({ data: null, error: "Vous n'avez pas la permission d'ajouter des audios" }, { status: 403 });
	}

	try {
		const body = await request.json();
		const parsed = UploadUrlSchema.safeParse(body);
		if (!parsed.success) {
			return json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
		}

		const { fileName, contentType, category } = parsed.data;

		const ALLOWED_TYPES = [
			'audio/mpeg',
			'audio/mp3',
			'audio/wav',
			'audio/x-wav',
			'audio/flac',
			'audio/ogg',
			'audio/mp4',
			'audio/x-m4a',
			'audio/aac'
		];

		if (!ALLOWED_TYPES.includes(contentType)) {
			return json(
				{ data: null, error: `Type non supporté: ${contentType}. Formats acceptés: MP3, WAV, FLAC, OGG, M4A, AAC` },
				{ status: 400 }
			);
		}

		const s3Key = generateS3Key(category, fileName);
		const s3Url = getS3Url(s3Key);
		const uploadUrl = await generatePresignedUploadUrl(s3Key, contentType);

		return json({
			data: { uploadUrl, s3Key, s3Url },
			error: null
		});
	} catch (error) {
		console.error('Upload URL error:', error);
		return json({ data: null, error: 'Failed to generate upload URL' }, { status: 500 });
	}
}
