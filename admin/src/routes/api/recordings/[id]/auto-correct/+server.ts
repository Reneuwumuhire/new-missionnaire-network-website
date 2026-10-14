import { error, json } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { getRecordingById, logAudit } from '../../../../../db/collections';
import { getDb } from '../../../../../db/mongo';
import { resolveRecordingSubtitle } from '$lib/server/recording-subtitle';
import { prepareRecordingSubtitleCorrection } from '$lib/server/subtitle-auto-correct';
import { deleteObject, getS3Url, putSubtitleText } from '$lib/server/s3';

async function context(id: string, user: App.Locals['user']) {
	if (!getPermissions(user).can_manage_recordings) throw error(403, 'Accès refusé');
	if (!ObjectId.isValid(id)) throw error(400, 'Enregistrement invalide');
	const recording = await getRecordingById(id);
	if (!recording) throw error(404, 'Enregistrement introuvable');
	return { recording, subtitle: await resolveRecordingSubtitle(recording) };
}

export const GET: RequestHandler = async ({ locals, params }) => {
	const { subtitle } = await context(params.id, locals.user);
	return json({ subtitle }, { headers: { 'Cache-Control': 'no-store' } });
};

export const POST: RequestHandler = async ({ locals, params, request, getClientAddress }) => {
	const { recording, subtitle } = await context(params.id, locals.user);
	if (!subtitle) throw error(422, 'Aucun fichier .srt attaché à la rediffusion ou au direct');
	const body = (await request.json().catch(() => ({}))) as {
		apply?: unknown;
		expectedKey?: unknown;
		expectedPdfId?: unknown;
	};
	if (body.apply === true && body.expectedKey !== subtitle.key) {
		throw error(409, 'Le fichier a changé depuis l’aperçu');
	}
	let prepared: Awaited<ReturnType<typeof prepareRecordingSubtitleCorrection>>;
	try {
		prepared = await prepareRecordingSubtitleCorrection(recording, subtitle.key);
	} catch (cause) {
		console.error('[recording-subtitle-auto-correct] failed:', cause);
		throw error(422, cause instanceof Error ? cause.message : 'Correction impossible');
	}
	if (body.apply === true && body.expectedPdfId !== prepared.pdfId) {
		throw error(409, 'Le PDF a changé depuis l’aperçu');
	}
	const examples = [
		...new Map(
			prepared.changes.map((change) => [`${change.source}\0${change.from}\0${change.to}`, change])
		).values()
	].slice(0, 12);
	const summary = {
		changeCount: prepared.changes.length,
		pdfChangeCount: prepared.changes.filter((change) => change.source === 'pdf').length,
		cueCount: prepared.cueCount,
		pdfUsed: prepared.pdfId !== null,
		pdfId: prepared.pdfId,
		originalKey: prepared.originalKey,
		source: subtitle.source,
		samples: examples
	};
	if (body.apply !== true || prepared.changes.length === 0) {
		return json({ ...summary, applied: false });
	}
	const key = `subtitles/${Date.now()}-${crypto.randomUUID()}.srt`;
	await putSubtitleText(key, prepared.text);
	const url = getS3Url(key);
	const filename = subtitle.filename.replace(/(?:\.corrig[eé])?\.srt$/i, '.corrigé.srt');
	let applied = false;
	try {
		const db = await getDb();
		if (subtitle.source === 'recording') {
			const result = await db.collection('recordings').updateOne(
				{ _id: new ObjectId(params.id), subtitle_srt_s3_key: subtitle.key },
				{
					$set: {
						subtitle_srt_s3_key: key,
						subtitle_srt_url: url,
						subtitle_filename: filename,
						subtitle_auto_corrected_at: new Date(),
						subtitle_auto_correct_pdf_id: prepared.pdfId,
						updated_at: new Date()
					}
				}
			);
			applied = result.modifiedCount > 0;
		} else if (subtitle.scheduledLiveId) {
			const result = await db.collection('scheduled_lives').updateOne(
				{
					_id: new ObjectId(subtitle.scheduledLiveId),
					recording_id: params.id,
					status: 'ended',
					subtitle_srt_s3_key: subtitle.key
				},
				{
					$set: {
						subtitle_srt_s3_key: key,
						subtitle_srt_url: url,
						subtitle_filename: filename,
						subtitle_auto_corrected_at: new Date(),
						subtitle_auto_correct_pdf_id: prepared.pdfId,
						updated_at: new Date().toISOString()
					}
				}
			);
			applied = result.modifiedCount > 0;
		}
	} catch (cause) {
		await deleteObject(key).catch((cleanup) =>
			console.error('[recording-subtitle-auto-correct] cleanup failed:', cleanup)
		);
		throw cause;
	}
	if (!applied) {
		await deleteObject(key).catch((cleanup) =>
			console.error('[recording-subtitle-auto-correct] cleanup failed:', cleanup)
		);
		throw error(409, 'Le fichier ou le direct a changé pendant la correction');
	}
	await logAudit({
		user_id: locals.user.email,
		user_email: locals.user.email,
		action: 'update',
		target_collection: subtitle.source === 'recording' ? 'recordings' : 'scheduled_lives',
		target_id: subtitle.scheduledLiveId ?? params.id,
		changes: {
			subtitle_auto_correct: {
				old: subtitle.key,
				new: { key, changes: prepared.changes.length, pdfId: prepared.pdfId }
			}
		},
		ip_address: getClientAddress()
	}).catch((cause) => console.error('[recording-subtitle-auto-correct] audit failed:', cause));
	return json({ ...summary, applied: true });
};
