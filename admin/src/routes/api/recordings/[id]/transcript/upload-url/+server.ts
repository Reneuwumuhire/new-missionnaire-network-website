import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { getPermissions } from '$lib/models/admin-user';
import { generatePdfS3Key, generatePresignedUploadUrl, getS3Url } from '$lib/server/s3';
import { getRecordingById } from '../../../../../../db/collections';

const MAX_PDF_BYTES = 100 * 1024 * 1024;

const UploadUrlSchema = z.object({
	fileName: z.string().min(1),
	contentType: z.string().optional(),
	size: z.number().int().positive().max(MAX_PDF_BYTES).optional()
});

function parseDate(value: string | Date | null | undefined): Date {
	if (!value) return new Date();
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? new Date() : date;
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const recording = await getRecordingById(params.id);
	if (!recording) throw error(404, 'Enregistrement introuvable');

	const parsed = UploadUrlSchema.safeParse(await request.json());
	if (!parsed.success) throw error(400, parsed.error.issues[0].message);

	const { fileName, size } = parsed.data;
	const contentType = parsed.data.contentType || 'application/pdf';
	if (!fileName.toLowerCase().endsWith('.pdf') || contentType !== 'application/pdf') {
		throw error(400, 'Sélectionnez un fichier PDF');
	}
	if (size && size > MAX_PDF_BYTES) throw error(400, 'PDF trop volumineux (max 100 Mo)');

	const s3Key = generatePdfS3Key(fileName, parseDate(recording.started_at));
	const uploadUrl = await generatePresignedUploadUrl(s3Key, 'application/pdf');

	return json({
		uploadUrl,
		s3Key,
		s3Url: getS3Url(s3Key)
	});
};
