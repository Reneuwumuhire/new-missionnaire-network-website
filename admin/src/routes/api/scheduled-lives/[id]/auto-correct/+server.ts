import { json, error } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { getScheduledLiveById, logAudit } from '../../../../../db/collections';
import { getDb } from '../../../../../db/mongo';
import { deleteObject, getS3Url, putSubtitleText } from '$lib/server/s3';
import { prepareSubtitleCorrection } from '$lib/server/subtitle-auto-correct';

export const POST: RequestHandler = async ({ locals, params, request, getClientAddress }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');
	const live = await getScheduledLiveById(params.id);
	if (!live) throw error(404, 'Direct introuvable');
	if (live.status !== 'scheduled' && live.status !== 'ended') {
		throw error(400, 'Correction disponible avant ou après le direct');
	}
	const body = (await request.json().catch(() => ({}))) as {
		apply?: unknown;
		expectedKey?: unknown;
	};
	if (body.apply === true && body.expectedKey !== live.subtitle_srt_s3_key) {
		throw error(409, 'Le fichier a changé depuis l’aperçu');
	}
	let prepared: Awaited<ReturnType<typeof prepareSubtitleCorrection>>;
	try {
		prepared = await prepareSubtitleCorrection(live);
	} catch (cause) {
		console.error('[subtitle-auto-correct] failed:', cause);
		throw error(422, cause instanceof Error ? cause.message : 'Correction impossible');
	}
	const uniqueExamples = [
		...new Map(
			prepared.changes.map((change) => [`${change.source}\0${change.from}\0${change.to}`, change])
		).values()
	];
	uniqueExamples.sort(
		(a, b) =>
			Number(b.source === 'pdf') - Number(a.source === 'pdf') ||
			Number(a.from.toLowerCase() === 'dieu') - Number(b.from.toLowerCase() === 'dieu')
	);
	const summary = {
		changeCount: prepared.changes.length,
		pdfChangeCount: prepared.changes.filter((change) => change.source === 'pdf').length,
		cueCount: prepared.cueCount,
		pdfUsed: prepared.pdfId !== null,
		comparedWords: prepared.comparedWords,
		differingWords: prepared.differingWords,
		originalKey: prepared.originalKey,
		samples: uniqueExamples.slice(0, 12)
	};
	if (body.apply !== true || prepared.text.length === 0 || prepared.changes.length === 0) {
		return json({ ...summary, applied: false });
	}
	const key = `subtitles/${Date.now()}-${crypto.randomUUID()}.srt`;
	const url = getS3Url(key);
	await putSubtitleText(key, prepared.text);
	const db = await getDb();
	const filename = (live.subtitle_filename || 'transcription.srt').replace(
		/(?:\.corrig[eé])?\.srt$/i,
		'.corrigé.srt'
	);
	let applied = false;
	try {
		const result = await db.collection('scheduled_lives').updateOne(
			{
				_id: new ObjectId(live._id),
				status: { $in: ['scheduled', 'ended'] },
				subtitle_srt_s3_key: prepared.originalKey
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
	} catch (cause) {
		await deleteObject(key).catch((cleanup) =>
			console.error('[subtitle-auto-correct] cleanup failed:', cleanup)
		);
		throw cause;
	}
	if (!applied) {
		await deleteObject(key).catch((cleanup) =>
			console.error('[subtitle-auto-correct] cleanup failed:', cleanup)
		);
		throw error(409, 'Le direct ou son fichier a changé pendant la correction');
	}
	await logAudit({
		user_id: locals.user.email,
		user_email: locals.user.email,
		action: 'update',
		target_collection: 'scheduled_lives',
		target_id: live._id,
		changes: {
			subtitle_auto_correct: {
				old: prepared.originalKey,
				new: { key, changes: prepared.changes.length, pdfId: prepared.pdfId }
			}
		},
		ip_address: getClientAddress()
	}).catch((cause) => console.error('[subtitle-auto-correct] audit log failed:', cause));
	return json({ ...summary, applied: true });
};
