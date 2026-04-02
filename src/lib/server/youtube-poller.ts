import { YOUTUBE_API_KEY } from '$env/static/private';
import { sendPushToAll, youtubeLivePayload } from './push-notifications';
import { claimNotificationSlot } from '../../db/collections';

const YOUTUBE_NOTIFICATION_COOLDOWN = 15 * 60 * 1000; // 15 min cooldown

export type LiveStatus = {
	isLive: boolean;
	videoId: string | null;
	title: string | null;
	description: string | null;
	thumbnail: string | null;
	duration: number;
	url: string | null;
	updatedAt: string | null;
};

const GLOBAL_KEY = Symbol.for('missionnaire_network_live_status');

const INITIAL_STATUS: LiveStatus = {
	isLive: false,
	videoId: null,
	title: null,
	description: null,
	thumbnail: null,
	duration: 0,
	url: null,
	updatedAt: null
};

const globalAny = globalThis as Record<symbol, LiveStatus>;

if (!globalAny[GLOBAL_KEY]) {
	globalAny[GLOBAL_KEY] = INITIAL_STATUS;
}

export function getLiveStatus(): LiveStatus {
	return globalAny[GLOBAL_KEY];
}

function updateStatus(newStatus: LiveStatus) {
	globalAny[GLOBAL_KEY] = newStatus;
}

const CHANNEL_ID = 'UCS3zqpqnCvT0SFa_jI662Kg';
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
let isChecking = false;
let lastSearchTime = 0;

// search.list costs 100 units — run it at most once per hour as a fallback
const SEARCH_INTERVAL = 60 * 60 * 1000; // 1 hour

/**
 * Hybrid live-stream detection:
 *
 * 1. **RSS + videos.list** (primary, every call) — RSS feed is free, videos.list
 *    costs 1 unit. Detects streams that appear in the channel's recent feed.
 *
 * 2. **search.list** (fallback, once per hour) — costs 100 units but catches live
 *    streams that haven't appeared in the RSS feed yet (RSS can lag 15-30 min).
 *
 * Quota budget: ~288 (videos.list) + 2,400 (search.list) ≈ 2,700 units/day
 * vs the old approach: ~9,600 units/day (search.list every 15 min)
 */
export async function checkAndIngestLiveStream() {
	if (isChecking) return;
	isChecking = true;

	try {
		const apiKey = YOUTUBE_API_KEY;
		if (!apiKey) {
			console.warn('[YouTube Poller] YOUTUBE_API_KEY is not defined. Skipping check.');
			return;
		}

		// Step 1: Try RSS + videos.list first (cheap — 1 quota unit)
		const liveFromRss = await checkViaRss(apiKey);
		if (liveFromRss) return; // found live stream, done

		// Step 2: Fallback to search.list if enough time has passed (100 quota units)
		const now = Date.now();
		if (now - lastSearchTime > SEARCH_INTERVAL) {
			lastSearchTime = now;
			await checkViaSearch(apiKey);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[YouTube Poller] Error: ${message}`);
		updateStatus({ ...INITIAL_STATUS, updatedAt: new Date().toISOString() });
	} finally {
		isChecking = false;
	}
}

/** RSS feed (free) → videos.list (1 quota unit). Returns true if a live stream was found. */
async function checkViaRss(apiKey: string): Promise<boolean> {
	try {
		const rssResponse = await fetch(RSS_URL, {
			headers: { 'User-Agent': 'MissionnaireNetwork/1.0' }
		});

		if (!rssResponse.ok) {
			console.error(`[YouTube Poller] RSS fetch failed: ${rssResponse.status}`);
			return false;
		}

		const rssText = await rssResponse.text();
		const videoIdMatches = [...rssText.matchAll(/<yt:videoId>([^<]+)<\/yt:videoId>/g)];
		if (videoIdMatches.length === 0) return false;

		const videoIds = videoIdMatches.slice(0, 5).map((m) => m[1]);

		const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${videoIds.join(',')}&key=${apiKey}`;
		const apiResponse = await fetch(apiUrl);

		if (!apiResponse.ok) {
			console.error(`[YouTube Poller] videos.list failed: ${apiResponse.status}`);
			return false;
		}

		const data = (await apiResponse.json()) as VideoListResponse;
		return handleLiveResult(data);
	} catch (error) {
		console.error(`[YouTube Poller] RSS check error: ${error instanceof Error ? error.message : error}`);
		return false;
	}
}

/** search.list fallback (100 quota units). Catches live streams not yet in RSS. */
async function checkViaSearch(apiKey: string): Promise<void> {
	try {
		const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL_ID}&type=video&eventType=live&key=${apiKey}`;
		const response = await fetch(apiUrl);

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			const errorMsg =
				(errorData as Record<string, Record<string, string>>).error?.message || response.statusText;
			console.error(`[YouTube Poller] search.list failed: ${errorMsg}`);
			return;
		}

		const data = await response.json();

		if (data.items && data.items.length > 0) {
			const item = data.items[0];
			await applyLiveStatus(item.id.videoId, item.snippet);
		} else {
			updateStatus({ ...INITIAL_STATUS, updatedAt: new Date().toISOString() });
		}
	} catch (error) {
		console.error(`[YouTube Poller] search check error: ${error instanceof Error ? error.message : error}`);
	}
}

type VideoListResponse = {
	items?: Array<{
		id: string;
		snippet: {
			title: string;
			description: string;
			liveBroadcastContent: string;
			thumbnails: Record<string, { url: string }>;
		};
		liveStreamingDetails?: { actualStartTime?: string };
	}>;
};

/** Processes videos.list response. Returns true if a live stream was found. */
async function handleLiveResult(data: VideoListResponse): Promise<boolean> {
	const liveItem = data.items?.find((item) => item.snippet.liveBroadcastContent === 'live');

	if (liveItem) {
		await applyLiveStatus(liveItem.id, liveItem.snippet);
		return true;
	}
	return false;
}

/** Updates status and sends push notification for a detected live stream. */
async function applyLiveStatus(
	videoId: string,
	snippet: { title: string; description: string; thumbnails: Record<string, { url: string }> }
) {
	const title = snippet.title;
	const thumbnail = snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url;
	const streamUrl = `https://www.youtube.com/watch?v=${videoId}`;

	console.log(`[YouTube Poller] Live stream detected: ${title} (${videoId})`);

	updateStatus({
		isLive: true,
		videoId,
		title,
		description: snippet.description,
		thumbnail: thumbnail || null,
		duration: 0,
		url: streamUrl,
		updatedAt: new Date().toISOString()
	});

	const canSend = await claimNotificationSlot('youtube_live', YOUTUBE_NOTIFICATION_COOLDOWN);
	if (canSend) {
		console.log('[YouTube Poller] YouTube is live. Sending push notifications.');
		sendPushToAll(youtubeLivePayload(title, streamUrl)).catch((e) =>
			console.error('[YouTube Poller] Push notification error:', e)
		);
	}
}
