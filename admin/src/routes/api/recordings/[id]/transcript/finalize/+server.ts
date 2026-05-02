import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ObjectId, type Document } from 'mongodb';
import { z } from 'zod';
import { getPermissions } from '$lib/models/admin-user';
import { ensureVideoForRecording } from '$lib/server/video-sync';
import { deleteObject, getS3Url } from '$lib/server/s3';
import { getDb } from '../../../../../../db/mongo';
import { getRecordingById, logAudit, updateRecording } from '../../../../../../db/collections';

const MAX_PDF_BYTES = 100 * 1024 * 1024;

const FinalizeSchema = z.object({
	fileName: z.string().min(1),
	s3Key: z.string().min(1),
	s3Url: z.string().url(),
	size: z.number().int().positive().max(MAX_PDF_BYTES),
	replacePdfId: z.string().nullable().optional()
});

function parseDate(value: string | Date | null | undefined): Date | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function publishedDateFromFilename(filename: string, fallback: string | Date | null | undefined): Date {
	const match = filename.match(/(19\d{2}|20\d{2})[\s_.-]*([01]\d)[\s_.-]*([0-3]\d)/);
	if (match) {
		const [, year, month, day] = match;
		const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
		if (!Number.isNaN(date.getTime())) return date;
	}
	return parseDate(fallback) ?? new Date();
}

export const POST: RequestHandler = async ({ locals, params, request, getClientAddress }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const recording = await getRecordingById(params.id);
	if (!recording) throw error(404, 'Enregistrement introuvable');
	if (!recording.source_video_id) {
		throw error(400, 'Ajoutez un lien YouTube à cet enregistrement avant la transcription');
	}

	const parsed = FinalizeSchema.safeParse(await request.json());
	if (!parsed.success) throw error(400, parsed.error.issues[0].message);

	const { fileName, s3Key, s3Url, size, replacePdfId } = parsed.data;
	if (!s3Key.startsWith('pdf/') || !s3Key.toLowerCase().endsWith('.pdf')) {
		throw error(400, 'Clé S3 PDF invalide');
	}
	if (getS3Url(s3Key) !== s3Url) throw error(400, 'URL S3 invalide');

	const { videoObjectId } = await ensureVideoForRecording({
		videoId: recording.source_video_id,
		title: recording.title,
		description: recording.description,
		thumbnailUrl: recording.thumbnail_url,
		startedAt: recording.started_at,
		durationSec: recording.duration_sec
	});

	const db = await getDb();
	const pdfs = db.collection('pdfs');
	const videos = db.collection('videos');
	const now = new Date();
	const replaceId = replacePdfId && ObjectId.isValid(replacePdfId) ? new ObjectId(replacePdfId) : null;
	const existingByKey = await pdfs.findOne({ s3Key });
	const existingForReplace = replaceId ? await pdfs.findOne({ _id: replaceId }) : null;
	if (replacePdfId && !replaceId) throw error(400, 'PDF à remplacer invalide');
	if (replaceId && !existingForReplace) throw error(404, 'PDF à remplacer introuvable');
	if (
		existingForReplace?.videoId &&
		String(existingForReplace.videoId) !== String(videoObjectId)
	) {
		throw error(400, 'Ce PDF appartient à une autre vidéo');
	}

	const previousS3Key =
		typeof existingForReplace?.s3Key === 'string' ? existingForReplace.s3Key : null;
	const pdfInfo =
		existingForReplace ??
		existingByKey ??
		({
			_id: new ObjectId(),
			videoId: videoObjectId
		} as const);
	const existingPdfFields = (existingForReplace ?? {}) as Record<string, unknown>;
	const updatedPdfInfo = {
		...pdfInfo,
		videoId: videoObjectId,
		filename: fileName,
		s3Key,
		url: s3Url,
		size,
		uploadDate: existingForReplace ? existingPdfFields.uploadDate || now : now,
		updatedAt: now,
		publishedOn: publishedDateFromFilename(fileName, recording.started_at),
		createdFrom: existingForReplace ? existingPdfFields.createdFrom || 'live_recording' : 'live_recording',
		recordingId: new ObjectId(params.id)
	};

	if (existingForReplace || existingByKey) {
		const { _id: _pdfId, ...pdfUpdateFields } = updatedPdfInfo as Record<string, unknown>;
		await pdfs.updateOne({ _id: pdfInfo._id }, { $set: pdfUpdateFields });
	} else {
		await pdfs.insertOne(updatedPdfInfo);
	}

	await videos.updateOne(
		{ _id: videoObjectId },
		{ $pull: { pdfInfo: { s3Key: { $in: [previousS3Key, s3Key].filter(Boolean) } } } } as Document
	);
	await videos.updateOne({ _id: videoObjectId }, { $pull: { pdfInfo: { _id: pdfInfo._id } } } as Document);
	await videos.updateOne({ _id: videoObjectId }, { $pull: { pdfInfo: { _id: String(pdfInfo._id) } } } as Document);
	await videos.updateOne({ _id: videoObjectId }, { $push: { pdfInfo: updatedPdfInfo } } as Document);
	await updateRecording(params.id, { transcript_pdf_id: String(updatedPdfInfo._id) });

	if (previousS3Key && previousS3Key !== s3Key) {
		deleteObject(previousS3Key).catch((err) =>
			console.error('[recordings/transcript/finalize] old PDF delete failed:', err)
		);
	}

	await logAudit({
		user_id: locals.user._id ?? locals.user.email,
		user_email: locals.user.email,
		action: existingForReplace ? 'update' : 'create',
		target_collection: 'pdfs',
		target_id: String(updatedPdfInfo._id),
		changes: {
			recordingId: { old: null, new: params.id },
			videoId: { old: null, new: String(videoObjectId) },
			s3Key: { old: previousS3Key, new: s3Key }
		},
		ip_address: getClientAddress()
	});

	return json({
		ok: true,
		pdfInfo: updatedPdfInfo
	});
};
