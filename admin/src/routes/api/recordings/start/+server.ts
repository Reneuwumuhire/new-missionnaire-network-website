import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { RecorderError, recorderStart } from '$lib/server/recorder-client';
import {
	getBroadcastAdminState,
	setBroadcastAdminState,
	updateScheduledLive,
	logAudit
} from '../../../../db/collections';

/** Recording start usually coincides with the start of the subtitled audio
 *  (the recorded part IS what the SRT transcribes), so it doubles as the
 *  default subtitle anchor: SRT 00:00 = "now". Only when no anchor exists
 *  yet — a manual sync done earlier is never overwritten — and fully
 *  adjustable afterwards via the sync panel (nudges / jump-to-cue). */
async function autoAnchorSubtitles(): Promise<boolean> {
	try {
		const gate = await getBroadcastAdminState({ fresh: true });
		if (!gate.is_live || !gate.subtitle_srt_url || gate.subtitle_anchor_epoch_ms !== null) {
			return false;
		}
		const anchor = Date.now();
		await setBroadcastAdminState({
			subtitle_anchor_epoch_ms: anchor,
			subtitle_offset_ms: 0
		});
		if (gate.scheduled_live_id) {
			await updateScheduledLive(gate.scheduled_live_id, {
				subtitle_anchor_epoch_ms: anchor,
				subtitle_offset_ms: 0
			});
		}
		return true;
	} catch (err) {
		// Best-effort: a failed auto-anchor must never block the recording.
		console.error('[recordings/start] subtitle auto-anchor failed:', err);
		return false;
	}
}

export const POST: RequestHandler = async ({ locals, getClientAddress }) => {
	const user = locals.user;
	if (!getPermissions(user).can_manage_recordings) throw error(403, 'Accès refusé');

	try {
		const result = await recorderStart(user.email, user.name || null);
		const subtitlesAnchored = await autoAnchorSubtitles();
		await logAudit({
			user_id: user.email,
			user_email: user.email,
			action: 'create',
			target_collection: 'recordings',
			target_id: result.id,
			...(subtitlesAnchored ? { changes: { subtitle_auto_anchor: { old: null, new: 'recording-start' } } } : {}),
			ip_address: getClientAddress()
		});
		return json({ ...result, subtitlesAnchored });
	} catch (err) {
		if (err instanceof RecorderError) throw error(err.status, err.message);
		throw err;
	}
};
