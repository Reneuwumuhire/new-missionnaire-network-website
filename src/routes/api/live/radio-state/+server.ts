import { json } from '@sveltejs/kit';
import { getLiveAudioSourceUrl, probeLiveAudio } from '$lib/server/live-audio';
import {
	getRadioCachedStatus,
	getBroadcastAdminState,
	setRadioCachedStatus,
	countActiveListeners,
	heartbeatListener
} from '../../../../db/collections';

// How stale the cached Icecast probe may get before this endpoint refreshes it
// itself. The cron is the primary refresher, but it only writes while the gate
// is open and only every few minutes — so right after "Go Live", or during any
// cron gap, the cache lags and users see "offline" while audio is actually
// flowing. Probing here when stale closes that gap. Bounded by this window +
// the cache write so concurrent listeners don't each hammer Icecast.
const CACHE_STALE_MS = 20_000;

export async function GET({ url, fetch, setHeaders }) {
	setHeaders({
		'Cache-Control': 'no-store, no-cache, must-revalidate',
		Pragma: 'no-cache'
	});

	// Optional listener heartbeat — lets the player do `/radio-state?sid=...`
	// for its initial paint and register the listener in one round trip.
	const sid = url.searchParams.get('sid');
	if (sid) {
		heartbeatListener(sid).catch(() => {});
	}

	const [status, adminGate] = await Promise.all([getRadioCachedStatus(), getBroadcastAdminState()]);

	let listeners = 0;
	try {
		listeners = await countActiveListeners();
	} catch {
		// DB unavailable — return 0
	}

	let icecastLive = status?.isLive ?? false;
	let checkedAt = status?.checkedAt ?? null;
	let streamUrl = status?.streamUrl;

	// Self-heal a stale cache: if the gate is open but the cron hasn't refreshed
	// recently, probe live now so the user app reflects the real stream state
	// instead of a stale "offline". Result is written back so concurrent polls
	// within CACHE_STALE_MS reuse it rather than re-probing.
	const cacheAgeMs = checkedAt ? Date.now() - new Date(checkedAt).getTime() : Infinity;
	if (adminGate.is_live && cacheAgeMs > CACHE_STALE_MS) {
		try {
			const probe = await probeLiveAudio(fetch);
			icecastLive = probe.isLive;
			checkedAt = new Date().toISOString();
			streamUrl = probe.isLive ? getLiveAudioSourceUrl() : undefined;
			await setRadioCachedStatus({ isLive: icecastLive, checkedAt, streamUrl });
		} catch {
			// Probe failed — keep whatever the cache had.
		}
	}

	const isLive = icecastLive && adminGate.is_live;

	return json({
		isLive,
		checkedAt: checkedAt ?? new Date().toISOString(),
		listeners,
		streamUrl: isLive ? (streamUrl ?? getLiveAudioSourceUrl()) : undefined,
		title: adminGate.title,
		description: adminGate.description,
		thumbnailUrl: adminGate.thumbnail_url,
		// Live transcript: clients compute their SRT position locally as
		// (now − anchorEpochMs) + offsetMs − behindLiveEdge, so the polling
		// delay never shifts the text. serverNowMs lets them correct for
		// client clock skew. anchorEpochMs stays null until the admin clicks
		// "Démarrer les sous-titres".
		subtitles:
			adminGate.is_live && adminGate.subtitle_srt_s3_key
				? {
						url: `/api/subtitles/file?key=${encodeURIComponent(adminGate.subtitle_srt_s3_key)}`,
						anchorEpochMs: adminGate.subtitle_anchor_epoch_ms,
						offsetMs: adminGate.subtitle_offset_ms ?? 0
					}
				: null,
		serverNowMs: Date.now()
	});
}
