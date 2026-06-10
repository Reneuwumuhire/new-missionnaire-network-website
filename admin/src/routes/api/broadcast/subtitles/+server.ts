import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { parseSubtitleTriple } from '$lib/server/scheduled-live-validation';
import { deleteObject } from '$lib/server/s3';
import {
	getBroadcastAdminState,
	setBroadcastAdminState,
	updateScheduledLive,
	logAudit
} from '../../../../db/collections';

// Live subtitle sync control. The anchor is the wall-clock ms at which SRT
// 00:00:00 started playing ON AIR; the offset is the cumulative manual nudge.
// Listeners compute their transcript position locally from these two numbers,
// so propagation delay (≤8s polling) never shifts the displayed text.

const NUDGE_STEPS_MS = new Set([1000, 5000, 30000, -1000, -5000, -30000]);
const MAX_OFFSET_MS = 30 * 60 * 1000;

type Action = 'attach' | 'start' | 'nudge' | 'set-offset' | 'jump-to-cue' | 'clear';

export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const body = (await request.json()) as {
		action?: unknown;
		deltaMs?: unknown;
		offsetMs?: unknown;
		cueStartMs?: unknown;
		atEpochMs?: unknown;
		subtitle_srt_url?: unknown;
		subtitle_srt_s3_key?: unknown;
		subtitle_filename?: unknown;
	};
	const action = body.action as Action;
	if (!['attach', 'start', 'nudge', 'set-offset', 'jump-to-cue', 'clear'].includes(action)) {
		throw error(400, 'Action invalide');
	}

	const gate = await getBroadcastAdminState({ fresh: true });
	if (!gate.is_live) throw error(400, 'Aucun direct en cours');
	if (action !== 'clear' && action !== 'attach' && !gate.subtitle_srt_url) {
		throw error(400, 'Aucune transcription attachée à ce direct');
	}

	let anchor = gate.subtitle_anchor_epoch_ms;
	let offset = gate.subtitle_offset_ms ?? 0;

	// Attach (or replace) the SRT on an already-running broadcast — covers the
	// "stream started without subtitles" case. Writes the gate (listeners pick
	// it up on their next radio-state poll) AND the scheduled entry (replay).
	// The anchor resets: a new file means new timings, the operator re-syncs.
	if (action === 'attach') {
		const triple = parseSubtitleTriple(
			body.subtitle_srt_url,
			body.subtitle_srt_s3_key,
			body.subtitle_filename
		);
		if (!triple.subtitle_srt_url || !triple.subtitle_srt_s3_key) {
			throw error(400, 'Fichier .srt requis');
		}
		const oldKey = gate.subtitle_srt_s3_key;
		await setBroadcastAdminState({
			subtitle_srt_url: triple.subtitle_srt_url,
			subtitle_srt_s3_key: triple.subtitle_srt_s3_key,
			subtitle_anchor_epoch_ms: null,
			subtitle_offset_ms: 0
		});
		if (gate.scheduled_live_id) {
			await updateScheduledLive(gate.scheduled_live_id, {
				subtitle_srt_url: triple.subtitle_srt_url,
				subtitle_srt_s3_key: triple.subtitle_srt_s3_key,
				subtitle_filename: triple.subtitle_filename,
				subtitle_anchor_epoch_ms: null,
				subtitle_offset_ms: 0
			});
		}
		if (oldKey && oldKey !== triple.subtitle_srt_s3_key) {
			deleteObject(oldKey).catch((err) =>
				console.error('[broadcast/subtitles] old subtitle delete failed:', err)
			);
		}
		await logAudit({
			user_id: locals.user.email,
			user_email: locals.user.email,
			action: 'update',
			target_collection: 'broadcast_admin_state',
			target_id: 'current',
			changes: {
				subtitle_attached: { old: oldKey, new: triple.subtitle_srt_s3_key }
			},
			ip_address: getClientAddress()
		});
		return json({ ok: true, anchorEpochMs: null, offsetMs: 0 });
	}

	switch (action) {
		case 'start': {
			// The client sends its click-instant so network latency doesn't shift
			// the anchor; sanity-clamp to ±60s around server time.
			const at = typeof body.atEpochMs === 'number' ? body.atEpochMs : Date.now();
			anchor = Math.abs(at - Date.now()) <= 60_000 ? at : Date.now();
			offset = 0;
			break;
		}
		case 'nudge': {
			if (anchor === null) throw error(400, 'Sous-titres non démarrés');
			const delta = typeof body.deltaMs === 'number' ? body.deltaMs : NaN;
			if (!NUDGE_STEPS_MS.has(delta)) throw error(400, 'Décalage invalide');
			offset = Math.max(-MAX_OFFSET_MS, Math.min(MAX_OFFSET_MS, offset + delta));
			break;
		}
		case 'set-offset': {
			if (anchor === null) throw error(400, 'Sous-titres non démarrés');
			const value = typeof body.offsetMs === 'number' ? body.offsetMs : NaN;
			if (!Number.isFinite(value)) throw error(400, 'Décalage invalide');
			offset = Math.max(-MAX_OFFSET_MS, Math.min(MAX_OFFSET_MS, Math.round(value)));
			break;
		}
		case 'jump-to-cue': {
			// "This cue is being spoken right now" — re-anchor from a known cue,
			// for when the exact start moment was missed. Like 'start', the
			// client's click instant rides along so request latency doesn't
			// shift the anchor; sanity-clamped to ±60s around server time.
			const cueStart = typeof body.cueStartMs === 'number' ? body.cueStartMs : NaN;
			if (!Number.isFinite(cueStart) || cueStart < 0) throw error(400, 'Réplique invalide');
			const at = typeof body.atEpochMs === 'number' ? body.atEpochMs : Date.now();
			const clickedAt = Math.abs(at - Date.now()) <= 60_000 ? at : Date.now();
			anchor = clickedAt - Math.round(cueStart);
			offset = 0;
			break;
		}
		case 'clear': {
			anchor = null;
			offset = 0;
			break;
		}
	}

	await setBroadcastAdminState({
		subtitle_anchor_epoch_ms: anchor,
		subtitle_offset_ms: offset
	});

	// Mirror onto the scheduled_lives entry — the replay computes its transcript
	// offset from there long after the gate has been reused.
	if (gate.scheduled_live_id) {
		await updateScheduledLive(gate.scheduled_live_id, {
			subtitle_anchor_epoch_ms: anchor,
			subtitle_offset_ms: offset
		});
	}

	await logAudit({
		user_id: locals.user.email,
		user_email: locals.user.email,
		action: 'update',
		target_collection: 'broadcast_admin_state',
		target_id: 'current',
		changes: {
			subtitle_sync: {
				old: {
					anchor: gate.subtitle_anchor_epoch_ms,
					offset: gate.subtitle_offset_ms
				},
				new: { action, anchor, offset }
			}
		},
		ip_address: getClientAddress()
	});

	return json({ ok: true, anchorEpochMs: anchor, offsetMs: offset });
};

// Server-side proxy of the current broadcast's SRT for the sync panel preview
// (avoids depending on S3 CORS for browser GETs).
export const GET: RequestHandler = async ({ locals }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const gate = await getBroadcastAdminState();
	if (!gate.subtitle_srt_url) throw error(404, 'Aucune transcription attachée');

	const res = await fetch(gate.subtitle_srt_url);
	if (!res.ok) throw error(502, 'Transcription inaccessible sur S3');
	const text = await res.text();
	return new Response(text, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'private, max-age=60'
		}
	});
};
