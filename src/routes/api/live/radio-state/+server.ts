import { getLiveAudioSourceUrl, getLiveAudioHlsUrl } from '$lib/server/live-audio';
import { refreshRadioSnapshot } from '$lib/server/icecast';
import {
	canAccessStudioTest,
	getRadioCachedStatus,
	getBroadcastAdminState
} from '../../../../db/collections';

export async function GET({ fetch, url, setHeaders }) {
	setHeaders({
		'Cache-Control': 'no-store, no-cache, must-revalidate',
		Pragma: 'no-cache'
	});

	const [status, adminGate] = await Promise.all([getRadioCachedStatus(), getBroadcastAdminState()]);
	// A Studio quick-test must never turn the public radio/player on. Only its
	// capability URL can observe this temporary stream.
	if (
		adminGate.is_test &&
		!(await canAccessStudioTest(adminGate.scheduled_live_id, url.searchParams.get('test')))
	) {
		return Response.json({ broadcastOpen: false, isLive: false, checkedAt: null, listeners: 0 });
	}

	const audio = adminGate.is_live ? await refreshRadioSnapshot(fetch, status) : null;
	const isLive = Boolean(audio?.isLive && adminGate.is_live);
	const subtitleUrl =
		adminGate.is_live && adminGate.subtitle_srt_s3_key
			? `/api/subtitles/file?key=${encodeURIComponent(adminGate.subtitle_srt_s3_key)}`
			: null;

	return Response.json({
		broadcastOpen: adminGate.is_live,
		isLive,
		checkedAt: audio?.checkedAt ?? null,
		listeners: isLive ? (audio?.listeners ?? 0) : 0,
		streamUrl: isLive ? (audio?.streamUrl ?? getLiveAudioSourceUrl()) : undefined,
		// DVR playlist — lets the player offer pause/resume + seek-back +
		// jump-to-live. Absent when LIVE_AUDIO_HLS_URL isn't configured.
		hlsUrl: isLive ? getLiveAudioHlsUrl() || undefined : undefined,
		title: adminGate.title,
		description: adminGate.description,
		thumbnailUrl: adminGate.thumbnail_url,
		// Live transcript: clients compute their SRT position locally as
		// (now − anchorEpochMs) + offsetMs − behindLiveEdge, so the polling
		// delay never shifts the text. serverNowMs lets them correct for
		// client clock skew. Studio supplies the initial anchor and either Studio
		// or admin can subsequently re-sync it.
		subtitles: subtitleUrl
			? {
					url: subtitleUrl,
					anchorEpochMs: adminGate.subtitle_anchor_epoch_ms,
					offsetMs: adminGate.subtitle_offset_ms ?? 0,
					pausedPositionMs: adminGate.subtitle_paused_position_ms,
					// Use the same-origin URL for the current file throughout the timeline.
					timeline: adminGate.subtitle_timeline.map((segment) =>
						segment.url === adminGate.subtitle_srt_url ? { ...segment, url: subtitleUrl } : segment
					)
				}
			: null,
		serverNowMs: Date.now()
	});
}
