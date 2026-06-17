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
 *  default subtitle anchor: SRT 00:00 = the operator's monitor position at this
 *  instant. Using the monitor's on-air position (not raw Date.now()) bakes the
 *  operator's listening latency into the anchor the same way the public player
 *  models its own, so the two cancel. Only when no anchor exists yet — a manual
 *  sync done earlier is never overwritten — and fully adjustable afterwards via
 *  the sync panel (nudges / jump-to-cue). */
async function autoAnchorSubtitles(atEpochMs?: number): Promise<boolean> {
	try {
		const gate = await getBroadcastAdminState({ fresh: true });
		if (!gate.is_live || !gate.subtitle_srt_url || gate.subtitle_anchor_epoch_ms !== null) {
			return false;
		}
		// Trust the client monitor position only when it's sane (±60s of server
		// time); otherwise fall back to wall-clock now.
		const anchor =
			typeof atEpochMs === 'number' && Math.abs(atEpochMs - Date.now()) <= 60_000
				? Math.round(atEpochMs)
				: Date.now();
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

export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
	const user = locals.user;
	if (!getPermissions(user).can_manage_recordings) throw error(403, 'Accès refusé');

	// Optional: the operator monitor's on-air position, used as the subtitle
	// auto-anchor so it isn't skewed by the operator's listening latency.
	let monitorAtEpochMs: number | undefined;
	try {
		const body = (await request.json().catch(() => null)) as { anchorEpochMs?: unknown } | null;
		if (body && typeof body.anchorEpochMs === 'number') monitorAtEpochMs = body.anchorEpochMs;
	} catch {
		// No / invalid body — fall back to wall-clock anchoring.
	}

	try {
		const result = await recorderStart(user.email, user.name || null);
		const subtitlesAnchored = await autoAnchorSubtitles(monitorAtEpochMs);
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
