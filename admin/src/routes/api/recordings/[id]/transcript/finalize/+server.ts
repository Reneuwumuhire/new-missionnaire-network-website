import { objectIdString } from '$lib/server/mongo-input';
import { verifyAdminSession } from '$lib/server/admin-session';
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
	replacePdfId: objectIdString.nullish()
});

function parseDate(value: string | Date | null | undefined): Date | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function publishedDateFromFilename(
	filename: string,
	fallback: string | Date | null | undefined
): Date {
	const match = filename.match(/(19\d{2}|20\d{2})[\s_.-]*([01]\d)[\s_.-]*([0-3]\d)/);
	if (match) {
		const [, year, month, day] = match;
		const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
		if (!Number.isNaN(date.getTime())) return date;
	}
	return parseDate(fallback) ?? new Date();
}

export const POST: RequestHandler = async ({ params, request, getClientAddress, cookies }) => {
	const adminUser = await verifyAdminSession(cookies);
	if (!getPermissions(adminUser).can_manage_recordings) throw error(403, 'Accès refusé');

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
	const replaceId = replacePdfId ? new ObjectId(replacePdfId) : null;
	const videoIds = [videoObjectId, String(videoObjectId)];
	const existingByKey = await pdfs.findOne({ s3Key });
	const existingForReplace = replaceId
		? await pdfs.findOne({ _id: replaceId, videoId: { $in: videoIds } })
		: null;
	if (replaceId && !existingForReplace) throw error(404, 'PDF à remplacer introuvable');
	if (existingByKey && !videoIds.some((id) => String(id) === String(existingByKey.videoId))) {
		throw error(409, 'Ce PDF appartient à une autre vidéo');
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
		createdFrom: existingForReplace
			? existingPdfFields.createdFrom || 'live_recording'
			: 'live_recording',
		recordingId: new ObjectId(params.id)
	};

	if (existingForReplace || existingByKey) {
		const { _id: _pdfId, ...pdfUpdateFields } = updatedPdfInfo as Record<string, unknown>;
		const updated = await pdfs.updateOne(
			{ _id: pdfInfo._id, videoId: { $in: videoIds } },
			{ $set: pdfUpdateFields }
		);
		if (!updated.matchedCount) throw error(409, 'Le PDF a été modifié entre-temps');
	} else {
		await pdfs.insertOne(updatedPdfInfo);
	}

	await videos.updateOne({ _id: videoObjectId }, {
		$pull: { pdfInfo: { s3Key: { $in: [previousS3Key, s3Key].filter(Boolean) } } }
	} as Document);
	await videos.updateOne({ _id: videoObjectId }, {
		$pull: { pdfInfo: { _id: pdfInfo._id } }
	} as Document);
	await videos.updateOne({ _id: videoObjectId }, {
		$pull: { pdfInfo: { _id: String(pdfInfo._id) } }
	} as Document);
	await videos.updateOne({ _id: videoObjectId }, {
		$push: { pdfInfo: updatedPdfInfo }
	} as Document);
	await updateRecording(params.id, { transcript_pdf_id: String(updatedPdfInfo._id) });

	if (previousS3Key && previousS3Key !== s3Key) {
		Promise.all([
			pdfs.findOne({ s3Key: previousS3Key }, { projection: { _id: 1 } }),
			videos.findOne({ 'pdfInfo.s3Key': previousS3Key }, { projection: { _id: 1 } })
		])
			.then(([pdfReference, videoReference]) => {
				if (!pdfReference && !videoReference) return deleteObject(previousS3Key);
			})
			.catch((err) =>
				console.error('[recordings/transcript/finalize] old PDF delete failed:', err)
			);
	}

	await logAudit({
		user_id: adminUser._id ?? adminUser.email,
		user_email: adminUser.email,
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
