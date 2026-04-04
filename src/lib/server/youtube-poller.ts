import { YOUTUBE_API_KEY } from '$env/static/private';
import { sendPushToAll, youtubeLivePayload } from './push-notifications';
import {
	claimNotificationSlot,
	claimCheckSlot,
	getYouTubeCachedStatus,
	setYouTubeCachedStatus
} from '../../db/collections';

const YOUTUBE_NOTIFICATION_COOLDOWN = 15 * 60 * 1000; // 15 min cooldown
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes between RSS checks
const SEARCH_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours between search.list calls

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

// In-memory cache — used as a fast local read within a single instance.
// Always written through to MongoDB so other instances stay in sync.
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

/**
 * Returns the current YouTube live status.
 * Reads from in-memory cache first, falls back to MongoDB on cold starts.
 */
export async function getLiveStatus(): Promise<LiveStatus> {
	const local = globalAny[GLOBAL_KEY];
	// If the in-memory cache has been populated (has an updatedAt), use it
	if (local && local.updatedAt) {
		return local;
	}
	// Cold start — read from MongoDB
	const cached = await getYouTubeCachedStatus();
	if (cached) {
		globalAny[GLOBAL_KEY] = cached;
		return cached;
	}
	return INITIAL_STATUS;
}

function updateStatus(newStatus: LiveStatus) {
	globalAny[GLOBAL_KEY] = newStatus;
	// Write through to MongoDB (fire and forget)
	setYouTubeCachedStatus(newStatus).catch((e) =>
		console.error('[YouTube Poller] Failed to persist status to DB:', e)
	);
}

const CHANNEL_ID = 'UCS3zqpqnCvT0SFa_jI662Kg';
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

/**
 * Hybrid live-stream detection:
 *
 * 1. **RSS + videos.list** (primary, every 5 min) — RSS is free, videos.list
 *    costs 1 unit. Detects streams that appear in the channel's recent feed.
 *
 * 2. **search.list** (fallback, every 2 hours) — costs 100 units but catches
 *    live streams that haven't appeared in the RSS feed yet (RSS can lag 15-30 min).
 *
 * Both are throttled via DB locks so multiple serverless instances don't duplicate work.
 *
 * Quota budget: ~288 (videos.list) + ~1,200 (search.list) ≈ 1,500 units/day
 */
export async function checkAndIngestLiveStream(force = false) {
	// DB-level throttle — prevents multiple serverless instances from checking.
	// `force` bypasses the RSS throttle (used when radio goes live as a hint).
	if (!force) {
		const canCheck = await claimCheckSlot('youtube_rss', CHECK_INTERVAL);
		if (!canCheck) return;
	}

	try {
		const apiKey = YOUTUBE_API_KEY;
		if (!apiKey) {
			console.warn('[YouTube Poller] YOUTUBE_API_KEY is not defined. Skipping check.');
			return;
		}

		// Step 1: Try RSS + videos.list first (cheap — 1 quota unit)
		const liveFromRss = await checkViaRss(apiKey);
		if (liveFromRss) return; // found live stream, done

		// Step 2: Fallback to search.list (100 quota units, throttled to every 2 hours)
		const canSearch = await claimCheckSlot('youtube_search', SEARCH_INTERVAL);
		if (canSearch) {
			const liveFromSearch = await checkViaSearch(apiKey);
			if (liveFromSearch) return; // found live stream, done
		}

		// Neither method found a live stream — mark offline.
		// Only update if the current status is live (avoid overwriting on every check).
		const current = globalAny[GLOBAL_KEY];
		if (current && current.isLive) {
			updateStatus({ ...INITIAL_STATUS, updatedAt: new Date().toISOString() });
		} else if (!current?.updatedAt) {
			// First check ever — write an initial status
			updateStatus({ ...INITIAL_STATUS, updatedAt: new Date().toISOString() });
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[YouTube Poller] Error: ${message}`);
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
async function checkViaSearch(apiKey: string): Promise<boolean> {
	try {
		const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL_ID}&type=video&eventType=live&key=${apiKey}`;
		const response = await fetch(apiUrl);

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			const errorMsg =
				(errorData as Record<string, Record<string, string>>).error?.message || response.statusText;
			console.error(`[YouTube Poller] search.list failed: ${errorMsg}`);
			return false;
		}

		const data = await response.json();

		if (data.items && data.items.length > 0) {
			const item = data.items[0];
			await applyLiveStatus(item.id.videoId, item.snippet);
			return true;
		}
		return false;
	} catch (error) {
		console.error(`[YouTube Poller] search check error: ${error instanceof Error ? error.message : error}`);
		return false;
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
