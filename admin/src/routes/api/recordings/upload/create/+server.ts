import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { createRecording, logAudit } from '../../../../../db/collections';
import {
	ensureVideoForRecording,
	extractYoutubeVideoId,
	getFirstTranscriptPdfForVideo
} from '$lib/server/video-sync';

const MAX_TITLE_LEN = 200;
const MAX_DESCRIPTION_LEN = 2000;
// Allow a day of clock skew, but reject obviously-wrong far-future dates so a
// typo (e.g. year 2206) doesn't bury the archive sort order.
const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;

/** Create a backfilled recording from a manually-uploaded MP3 — for a live we
 *  missed capturing on our platform but have elsewhere (e.g. YouTube). Inserts
 *  the metadata + a backdated `started_at`; the audio is uploaded separately
 *  via the existing /audio/upload-url + /audio/finalize flow (the finalize step
 *  promotes the doc from 'uploading' to 'ready'). */
export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const body = (await request.json()) as {
		title?: unknown;
		started_at?: unknown;
		description?: unknown;
		youtube_url?: unknown;
		thumbnail_url?: unknown;
		thumbnail_s3_key?: unknown;
	};

	const title = typeof body.title === 'string' ? body.title.trim() : '';
	if (!title) throw error(400, 'Titre requis');
	if (title.length > MAX_TITLE_LEN) {
		throw error(400, `Titre trop long (max ${MAX_TITLE_LEN} caractères)`);
	}

	if (typeof body.started_at !== 'string') throw error(400, 'Date requise');
	const startedAt = new Date(body.started_at);
	if (Number.isNaN(startedAt.getTime())) throw error(400, 'Date invalide');
	if (startedAt.getTime() > Date.now() + MAX_FUTURE_SKEW_MS) {
		throw error(400, 'La date ne peut pas être dans le futur');
	}

	let description: string | null = null;
	if (typeof body.description === 'string' && body.description.trim()) {
		const normalized = body.description.replaceAll('\r\n', '\n').trim();
		if (normalized.length > MAX_DESCRIPTION_LEN) {
			throw error(400, `Description trop longue (max ${MAX_DESCRIPTION_LEN} caractères)`);
		}
		description = normalized;
	}

	let sourceVideoId: string | null = null;
	if (typeof body.youtube_url === 'string' && body.youtube_url.trim()) {
		const videoId = extractYoutubeVideoId(body.youtube_url);
		if (!videoId) throw error(400, 'URL YouTube invalide');
		sourceVideoId = videoId;
	}

	// Thumbnails are uploaded by the client through the same broadcast-thumbnail
	// presign flow, so we only accept keys under that prefix — blocks pointing
	// the record at an arbitrary S3 object.
	let thumbnailUrl: string | null = null;
	let thumbnailS3Key: string | null = null;
	if (body.thumbnail_url != null || body.thumbnail_s3_key != null) {
		if (
			typeof body.thumbnail_url === 'string' &&
			typeof body.thumbnail_s3_key === 'string' &&
			body.thumbnail_url.startsWith('https://') &&
			body.thumbnail_s3_key.startsWith('broadcast-thumbnails/')
		) {
			thumbnailUrl = body.thumbnail_url;
			thumbnailS3Key = body.thumbnail_s3_key;
		} else {
			throw error(400, 'Données de vignette invalides');
		}
	}

	// If a YouTube link was given, make sure a matching `videos` doc exists
	// (so the public page's YouTube link + transcript resolve just like an
	// edited recording) and auto-attach any transcript already on that video.
	// Best-effort: a YouTube fetch failure shouldn't block creating the audio.
	let transcriptPdfId: string | null = null;
	if (sourceVideoId) {
		try {
			const { videoObjectId } = await ensureVideoForRecording({
				videoId: sourceVideoId,
				title,
				description,
				thumbnailUrl,
				startedAt,
				durationSec: null
			});
			const existingTranscript = await getFirstTranscriptPdfForVideo(videoObjectId);
			transcriptPdfId = existingTranscript?._id ?? null;
		} catch (err) {
			console.error('[recordings/upload/create] video link failed:', err);
		}
	}

	const id = await createRecording({
		title,
		started_at: startedAt,
		description,
		thumbnail_url: thumbnailUrl,
		thumbnail_s3_key: thumbnailS3Key,
		source_video_id: sourceVideoId,
		transcript_pdf_id: transcriptPdfId,
		created_by: locals.user.email,
		created_by_name: locals.user.name ?? null
	});

	await logAudit({
		user_id: locals.user.email,
		user_email: locals.user.email,
		action: 'create',
		target_collection: 'recordings',
		target_id: id,
		changes: {
			title: { old: null, new: title },
			started_at: { old: null, new: startedAt.toISOString() },
			source_video_id: { old: null, new: sourceVideoId }
		},
		ip_address: getClientAddress()
	});

	return json({ id });
};
