import { env } from '$env/dynamic/private';
import { normalizeLiveStreamUrl } from '$lib/utils/liveStreamUrl';

const DEFAULT_LIVE_AUDIO_SOURCE_URL = 'http://localhost:8000/radio.mp3';
const LIVE_AUDIO_PROBE_TIMEOUT_MS = 5000;
const LIVE_AUDIO_GRACE_WINDOW_MS = 35_000;
/** Minimum bytes the probe must read to confirm real audio data is flowing. */
const LIVE_AUDIO_MIN_BYTES = 256;

let lastHealthyProbeAt = 0;

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
		// The upstream server may return 200 even when no source is connected
		// (e.g. Icecast returns an HTML status page). Only treat it as live
		// if the response is OK *and* the content is actually audio.
		const isAudioContent =
			contentType.startsWith('audio/') ||
			contentType.includes('mpeg') ||
			contentType.includes('ogg') ||
			contentType.includes('aac');

		// Headers alone are not enough — Icecast can return 200 + audio/mpeg
		// even when no source is connected. Actually read bytes to confirm
		// real audio data is flowing.
		let hasAudioData = false;
		if (response.ok && isAudioContent && response.body) {
			const reader = response.body.getReader();
			try {
				let bytesRead = 0;
				while (bytesRead < LIVE_AUDIO_MIN_BYTES) {
					const { done, value } = await reader.read();
					if (done) break;
					bytesRead += value.byteLength;
				}
				hasAudioData = bytesRead >= LIVE_AUDIO_MIN_BYTES;
			} finally {
				reader.cancel();
			}
		} else {
			await response.body?.cancel();
		}

		const isHealthy = response.ok && isAudioContent && hasAudioData;
		if (isHealthy) {
			lastHealthyProbeAt = Date.now();
		}
		const withinGracePeriod =
			!isHealthy && lastHealthyProbeAt > 0 && Date.now() - lastHealthyProbeAt <= LIVE_AUDIO_GRACE_WINDOW_MS;

		return {
			isLive: isHealthy || withinGracePeriod,
			sourceUrl,
			status: response.status,
			error: null
		};
	} catch (error) {
		const withinGracePeriod =
			lastHealthyProbeAt > 0 && Date.now() - lastHealthyProbeAt <= LIVE_AUDIO_GRACE_WINDOW_MS;

		return {
			isLive: withinGracePeriod,
			sourceUrl,
			status: null,
			error: error instanceof Error ? error.message : 'Unknown live audio probe error'
		};
	} finally {
		clearTimeout(timeout);
	}
}
