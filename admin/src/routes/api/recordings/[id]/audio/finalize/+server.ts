import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import {
	getRecordingById,
	logAudit,
	updateRecording
} from '../../../../../../db/collections';
import { deleteObject, getS3Url, updateDownloadFilename } from '$lib/server/s3';

const MAX_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB hard cap
const MAX_DURATION_SEC = 12 * 60 * 60; // 12 h hard cap

/** Validate optional peaks payload from the client. Returns null if the
 *  client didn't send peaks; throws a 400-shaped error on malformed input. */
function parsePeaks(
	rawPeaks: unknown,
	rawPeaksDuration: unknown,
	fallbackDuration: number
): { peaks: number[]; peaksDurationSec: number } | null {
	if (!Array.isArray(rawPeaks)) return null;
	if (rawPeaks.length > 8000) throw error(400, 'Peaks trop volumineux');
	if (!rawPeaks.every((v) => typeof v === 'number' && Number.isFinite(v))) {
		throw error(400, 'Peaks invalides');
	}
	const peaksDurationSec =
		typeof rawPeaksDuration === 'number' && Number.isFinite(rawPeaksDuration)
			? rawPeaksDuration
			: fallbackDuration;
	return { peaks: rawPeaks as number[], peaksDurationSec };
}

export const POST: RequestHandler = async ({ locals, params, request, getClientAddress }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const { id } = params;
	if (!id) throw error(400, 'ID manquant');

	const current = await getRecordingById(id);
	if (!current) throw error(404, 'Enregistrement introuvable');

	const body = (await request.json()) as {
		s3_key?: unknown;
		size_bytes?: unknown;
		duration_sec?: unknown;
		peaks?: unknown;
		peaks_duration_sec?: unknown;
	};

	const s3Key = typeof body.s3_key === 'string' ? body.s3_key : '';
	// The presign endpoint mints keys as `recordings/{id}-{timestamp}.mp3`.
	// Enforcing the prefix here blocks a caller from pointing at an arbitrary
	// S3 object we didn't sign for them.
	if (!s3Key.startsWith(`recordings/${id}-`) || !s3Key.endsWith('.mp3')) {
		throw error(400, 'Clé S3 invalide');
	}

	const sizeBytes = typeof body.size_bytes === 'number' ? body.size_bytes : Number.NaN;
	if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_SIZE_BYTES) {
		throw error(400, 'Taille de fichier invalide');
	}

	const durationSec = typeof body.duration_sec === 'number' ? Math.floor(body.duration_sec) : Number.NaN;
	if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > MAX_DURATION_SEC) {
		throw error(400, 'Durée invalide');
	}

	// Optional: precomputed waveform peaks from the client (e.g. the trim
	// editor already decoded the sliced MP3). Stored inline so the admin
	// editor can render the waveform instantly on future opens.
	const parsed = parsePeaks(body.peaks, body.peaks_duration_sec, durationSec);

	const s3Url = getS3Url(s3Key);
	// Audio changed — always set peaks fields (to the fresh values if the
	// client sent them, otherwise to null) so the admin editor never
	// renders a stale waveform that doesn't match the new bytes.
	const ok = await updateRecording(id, {
		s3_key: s3Key,
		s3_url: s3Url,
		size_bytes: sizeBytes,
		duration_sec: durationSec,
		peaks: parsed?.peaks ?? null,
		peaks_duration_sec: parsed?.peaksDurationSec ?? null
	});
	if (!ok) throw error(500, 'Mise à jour échouée');

	// Delete the previous audio file — fire-and-forget so a stale S3 object
	// doesn't block the admin response. Skip if the prior key was somehow
	// identical (shouldn't happen: new keys are timestamped).
	if (current.s3_key && current.s3_key !== s3Key) {
		deleteObject(current.s3_key).catch((err) =>
			console.error('[recordings/audio/finalize] old audio delete failed:', err)
		);
	}

	// Carry the current title into the new object's Content-Disposition so
	// downloads land on disk with the expected filename.
	if (current.title) {
		updateDownloadFilename(s3Key, current.title).catch((err) =>
			console.error('[recordings/audio/finalize] Content-Disposition update failed:', err)
		);
	}

	await logAudit({
		user_id: locals.user.email,
		user_email: locals.user.email,
		action: 'update',
		target_collection: 'recordings',
		target_id: id,
		changes: {
			s3_key: { old: current.s3_key ?? null, new: s3Key },
			size_bytes: { old: current.size_bytes ?? null, new: sizeBytes },
			duration_sec: { old: current.duration_sec ?? null, new: durationSec }
		},
		ip_address: getClientAddress()
	});

	return json({ ok: true, s3_key: s3Key, s3_url: s3Url, size_bytes: sizeBytes, duration_sec: durationSec });
};
