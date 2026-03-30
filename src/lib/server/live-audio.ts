import { env } from '$env/dynamic/private';
import { normalizeLiveStreamUrl } from '$lib/utils/liveStreamUrl';

const DEFAULT_LIVE_AUDIO_SOURCE_URL = 'http://localhost:8000/radio.mp3';
const LIVE_AUDIO_PROBE_TIMEOUT_MS = 3000;
const LIVE_AUDIO_GRACE_WINDOW_MS = 15000;

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
			headers: {
				Range: 'bytes=0-0'
			},
			signal: controller.signal
		});

		await response.body?.cancel();
		const isHealthy = response.ok;
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
