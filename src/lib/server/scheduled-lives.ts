import {
	getScheduledLiveBySlug,
	getBroadcastAdminState,
	getRadioCachedStatus,
	setScheduledLiveRecordingId,
	type ScheduledLive
} from '../../db/collections';
import { getPublishedById, getPublishedNearSession } from './recordings';

// ── Watch-page lifecycle resolution ──────────────────────────────────────────
// A scheduled live's stable URL (/live/<slug>) must behave correctly across
// its whole life: waiting room before the broadcast, live player while on air,
// replay redirect once the recording is published. This resolves the current
// phase from the entry doc + the broadcast gate + the Icecast probe cache —
// shared between the SSR page load and the client polling endpoint so both
// always agree.

export type WatchPhase = 'scheduled' | 'live' | 'ended' | 'ended_pending' | 'cancelled';

export interface WatchState {
	live: ScheduledLive;
	phase: WatchPhase;
	/** Audio genuinely flowing right now (gate open + Icecast up + gate linked
	 *  to THIS entry). The 'live' phase can briefly show with isLive false
	 *  while Icecast catches up — the player handles that state itself. */
	isLive: boolean;
	/** Set when phase === 'ended': the published replay for this session. */
	replayPath: string | null;
}

export async function getWatchState(slug: string): Promise<WatchState | null> {
	const live = await getScheduledLiveBySlug(slug);
	if (!live) return null;

	if (live.status === 'cancelled') {
		return { live, phase: 'cancelled', isLive: false, replayPath: null };
	}

	const [gate, radio] = await Promise.all([getBroadcastAdminState(), getRadioCachedStatus()]);
	const gateLinkedToThis = gate.scheduled_live_id === live._id;

	// On air: trust the gate over the doc status — go-live/end-live write both,
	// but a race (or an edge-cached read) can briefly disagree, and the gate is
	// the single source of "live right now".
	if (gate.is_live && gateLinkedToThis) {
		const isLive = radio?.isLive ?? false;
		return { live, phase: 'live', isLive, replayPath: null };
	}

	// Broadcast over (doc ended, or doc says live but the gate already closed):
	// resolve the published replay. recording_id makes the match sticky after
	// the first successful resolution; before that, fall back to the same
	// timestamp-proximity matching the legacy ?live= links use.
	if (live.status === 'ended' || live.status === 'live') {
		let replay = live.recording_id ? await getPublishedById(live.recording_id) : null;
		if (!replay) {
			const sessionIso = live.live_started_at ?? live.scheduled_at;
			replay = await getPublishedNearSession(sessionIso);
			if (replay) {
				// Fire-and-forget back-fill — a failure just means we match again.
				void setScheduledLiveRecordingId(live._id, replay.id);
			}
		}
		if (replay) {
			return {
				live,
				phase: 'ended',
				isLive: false,
				replayPath: `/live/rediffusions/${replay.id}?autoplay=1`
			};
		}
		return { live, phase: 'ended_pending', isLive: false, replayPath: null };
	}

	return { live, phase: 'scheduled', isLive: false, replayPath: null };
}
