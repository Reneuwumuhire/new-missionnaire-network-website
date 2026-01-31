import { YOUTUBE_API_KEY } from '$env/static/private';

export type LiveStatus = {
	isLive: boolean;
	videoId: string | null;
	title: string | null;
	url: string | null;
	updatedAt: string | null;
};

// Use globalThis to persist state across module reloads/instantiations in dev
const GLOBAL_KEY = Symbol.for('missionnaire_network_live_status');

const INITIAL_STATUS: LiveStatus = {
	isLive: false,
	videoId: null,
	title: null,
	url: null,
	updatedAt: null
};

// @ts-ignore
if (!globalThis[GLOBAL_KEY]) {
	// @ts-ignore
	globalThis[GLOBAL_KEY] = INITIAL_STATUS;
}

export function getLiveStatus(): LiveStatus {
	// @ts-ignore
	const status = globalThis[GLOBAL_KEY];
	return status;
}

function updateStatus(newStatus: LiveStatus) {
	// @ts-ignore
	globalThis[GLOBAL_KEY] = newStatus;
}

const CHANNEL_ID = 'UCS3zqpqnCvT0SFa_jI662Kg';
let isChecking = false;

export async function checkAndIngestLiveStream() {
	if (isChecking) {
		console.log('[YouTube Poller] Check already in progress, skipping');
		return;
	}

	isChecking = true;
	console.log(`[YouTube Poller] Checking for livestream (API) at ${new Date().toISOString()}`);

	try {
		const apiKey = YOUTUBE_API_KEY;
		if (!apiKey) {
			console.warn('[YouTube Poller] YOUTUBE_API_KEY is not defined. Skipping check.');
			return;
		}

		// Use YouTube Search API to find current live video for the channel
		const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL_ID}&type=video&eventType=live&key=${apiKey}`;

		const response = await fetch(apiUrl);

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			const errorMsg = errorData.error?.message || response.statusText;
			console.error(`[YouTube Poller] API request failed: ${errorMsg}`);
			throw new Error(`YouTube API error: ${response.status} - ${errorMsg}`);
		}

		const data = await response.json();

		if (data.items && data.items.length > 0) {
			const item = data.items[0];
			const videoId = item.id.videoId;
			const title = item.snippet.title;

			console.log(`[YouTube Poller] Live stream detected via API: ${title} (${videoId})`);

			updateStatus({
				isLive: true,
				videoId: videoId,
				title: title,
				url: `https://www.youtube.com/watch?v=${videoId}`,
				updatedAt: new Date().toISOString()
			});
		} else {
			console.log('[YouTube Poller] No active livestream found via API');
			updateStatus({
				isLive: false,
				videoId: null,
				title: null,
				url: null,
				updatedAt: new Date().toISOString()
			});
		}
	} catch (error) {
		console.error('[YouTube Poller] Error checking for livestream:', error);
		// CRITICAL FIX: If checking fails, assume NOT LIVE to prevent stuck banner
		updateStatus({
			isLive: false,
			videoId: null,
			title: null,
			url: null,
			updatedAt: new Date().toISOString()
		});
	} finally {
		isChecking = false;
	}
}
