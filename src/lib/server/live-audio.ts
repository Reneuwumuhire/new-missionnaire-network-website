import { env } from '$env/dynamic/private';
import { normalizeLiveStreamUrl } from '$lib/utils/liveStreamUrl';
import {
	setBroadcastAdminState,
	endScheduledLiveIfLive,
	type BroadcastAdminState
} from '../../db/collections';

const DEFAULT_LIVE_AUDIO_SOURCE_URL = 'http://localhost:8000/radio.mp3';
// Must cover the Fly app's measured 4-6s time-to-first-byte plus the two
// probe reads and the 800ms pause between them. A 4s budget made the probe
// fail while audio was flowing, which auto-ended live broadcasts.
const LIVE_AUDIO_PROBE_TIMEOUT_MS = 10_000;

// Grace window before the auto-end safety closes the broadcast gate when
// Icecast goes offline. Tolerates streamer uplink dropouts on poor networks
// without prematurely ending the broadcast (and stranding the in-flight
// recording, which the Fly.io recorder finalizes when its Icecast read EOFs).
// Override via ICECAST_OFFLINE_AUTO_END_MS env var.
export const ICECAST_OFFLINE_AUTO_END_MS = (() => {
	const raw = Number(env.ICECAST_OFFLINE_AUTO_END_MS);
	return Number.isFinite(raw) && raw > 0 ? raw : 300_000;
})();

/**
 * To confirm a live stream we read data in two rounds separated by a pause.
 * A real stream keeps producing bytes continuously; a static/buffered
 * response (e.g. Icecast with no source) delivers an initial burst then stalls.
 *
 * Round 1: read ≥ ROUND1_MIN_BYTES  (proves the server responded with data)
 * Wait   : PAUSE_MS
 * Round 2: read ≥ ROUND2_MIN_BYTES  (proves data is still flowing)
 *
 * NOTE: since the Icecast silence-fallback mount shipped, bytes flow on
 * /radio.mp3 even with no broadcaster, so this byte-flow probe alone can no
 * longer prove "on air". It remains as the fallback path of
 * `checkLiveAudio()` in $lib/server/icecast.ts, which primarily checks the
 * status page for the real mount's source.
 */
const ROUND1_MIN_BYTES = 512;
const ROUND2_MIN_BYTES = 512;
const PAUSE_BETWEEN_READS_MS = 800;

export type LiveAudioProbe = {
	isLive: boolean;
	sourceUrl: string;
	status: number | null;
	error: string | null;
};

export function getLiveAudioSourceUrl(): string {
	const configuredSource = normalizeLiveStreamUrl(env.LIVE_AUDIO_SOURCE_URL);
	if (configuredSource && configuredSource.length > 0) {
		return configuredSource;
	}
	return DEFAULT_LIVE_AUDIO_SOURCE_URL;
}

/** Read at least `minBytes` from a ReadableStreamDefaultReader. */
async function readAtLeast(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	minBytes: number
): Promise<boolean> {
	let bytesRead = 0;
	while (bytesRead < minBytes) {
		const { done, value } = await reader.read();
		if (done) return false;
		bytesRead += value.byteLength;
	}
	return true;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function probeLiveAudio(fetchFn: typeof fetch): Promise<LiveAudioProbe> {
	const sourceUrl = getLiveAudioSourceUrl();
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), LIVE_AUDIO_PROBE_TIMEOUT_MS);

	try {
		const response = await fetchFn(sourceUrl, {
			method: 'GET',
			signal: controller.signal
		});

		const contentType = response.headers.get('content-type') || '';
		const isAudioContent =
			contentType.startsWith('audio/') ||
			contentType.includes('mpeg') ||
			contentType.includes('ogg') ||
			contentType.includes('aac');

		let isLive = false;
		if (response.ok && isAudioContent && response.body) {
			const reader = response.body.getReader();
			try {
				// Round 1 — can we read initial data?
				const round1 = await readAtLeast(reader, ROUND1_MIN_BYTES);
				if (round1) {
					// Pause, then check data is still arriving.
					// A dead server sends a burst then stalls; a live stream keeps going.
					await sleep(PAUSE_BETWEEN_READS_MS);
					const round2 = await readAtLeast(reader, ROUND2_MIN_BYTES);
					isLive = round2;
				}
			} finally {
				reader.cancel();
			}
		} else {
			await response.body?.cancel();
		}

		return {
			isLive,
			sourceUrl,
			status: response.status,
			error: null
		};
	} catch (error) {
		return {
			isLive: false,
			sourceUrl,
			status: null,
			error: error instanceof Error ? error.message : 'Unknown live audio probe error'
		};
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * If the admin gate is open but Icecast has been offline longer than
 * ICECAST_OFFLINE_AUTO_END_MS, close the gate. Tracks the start of the
 * offline window in `broadcast_admin_state.icecast_offline_since`. Resets
 * that timestamp whenever Icecast is detected live again.
 *
 * Returns the (possibly updated) admin gate state.
 */
export async function applyAutoEndSafety(
	current: BroadcastAdminState,
	icecastLive: boolean
): Promise<BroadcastAdminState> {
	if (!current.is_live) {
		// Gate already closed — nothing to do, but keep timestamp clean.
		if (current.icecast_offline_since) {
			await setBroadcastAdminState({ icecast_offline_since: null });
			return { ...current, icecast_offline_since: null };
		}
		return current;
	}

	if (icecastLive) {
		// Stream is healthy — clear any stale "offline since" mark.
		if (current.icecast_offline_since) {
			await setBroadcastAdminState({ icecast_offline_since: null });
			return { ...current, icecast_offline_since: null };
		}
		return current;
	}

	// Gate open AND Icecast offline — start or check the timer.
	const now = Date.now();
	if (!current.icecast_offline_since) {
		const stamp = new Date(now).toISOString();
		await setBroadcastAdminState({ icecast_offline_since: stamp });
		return { ...current, icecast_offline_since: stamp };
	}

	const offlineFor = now - new Date(current.icecast_offline_since).getTime();
	if (offlineFor >= ICECAST_OFFLINE_AUTO_END_MS) {
		console.log(
			`[LiveAudio] Auto-ending broadcast: Icecast offline >${Math.round(ICECAST_OFFLINE_AUTO_END_MS / 1000)}s with gate open`
		);
		const endedAt = new Date(now).toISOString();
		await setBroadcastAdminState({
			is_live: false,
			ended_at: endedAt,
			icecast_offline_since: null
		});
		// Close out the linked scheduled_lives entry too — otherwise it stays
		// stuck on 'live' forever and keeps showing in the admin's "upcoming"
		// list. The manual End Live path does this; the auto-end must match.
		if (current.scheduled_live_id) {
			await endScheduledLiveIfLive(current.scheduled_live_id, endedAt);
		}
		return {
			...current,
			is_live: false,
			ended_at: endedAt,
			icecast_offline_since: null
		};
	}

	return current;
}
