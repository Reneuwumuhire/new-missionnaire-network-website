import { env } from '$env/dynamic/private';
import { normalizeLiveStreamUrl } from '$lib/utils/liveStreamUrl';

const DEFAULT_LIVE_AUDIO_SOURCE_URL = 'http://localhost:8000/radio.mp3';
const LIVE_AUDIO_PROBE_TIMEOUT_MS = 4000;

/**
 * To confirm a live stream we read data in two rounds separated by a pause.
 * A real stream keeps producing bytes continuously; a static/buffered
 * response (e.g. Icecast with no source) delivers an initial burst then stalls.
 *
 * Round 1: read ≥ ROUND1_MIN_BYTES  (proves the server responded with data)
 * Wait   : PAUSE_MS
 * Round 2: read ≥ ROUND2_MIN_BYTES  (proves data is still flowing)
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
