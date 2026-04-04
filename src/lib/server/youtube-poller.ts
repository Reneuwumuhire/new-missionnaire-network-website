import { YOUTUBE_API_KEY } from '$env/static/private';
import { sendPushToAll, youtubeLivePayload } from './push-notifications';
import {
	claimNotificationSlot,
	claimCheckSlot,
	getYouTubeCachedStatus,
	setYouTubeCachedStatus
} from '../../db/collections';
import { isNearScheduledLiveTime } from './youtube-websub';

const YOUTUBE_NOTIFICATION_COOLDOWN = 15 * 60 * 1000; // 15 min cooldown

// Near scheduled live times, poll every 2 min as safety net for WebSub.
// Outside live windows, poll every 15 min (just to catch edge cases).
const CHECK_INTERVAL_NEAR_LIVE = 2 * 60 * 1000;   // 2 minutes
const CHECK_INTERVAL_DEFAULT = 15 * 60 * 1000;     // 15 minutes

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
 * Live-stream detection — safety net for WebSub.
 *
 * Primary detection is via WebSub push notifications (zero quota).
 * This function runs as a fallback:
 * - Near scheduled live times (Wed/Sat 19:30, Sun 10:00 Berlin): every 2 min
 * - Outside live windows: every 15 min
 * - When radio goes live (force=true): immediately
 *
 * Uses RSS + videos.list (1 quota unit per call).
 * Quota budget: ~50-100 units/day (mostly during live windows).
 */
export async function checkAndIngestLiveStream(force = false) {
	if (!force) {
		const interval = isNearScheduledLiveTime() ? CHECK_INTERVAL_NEAR_LIVE : CHECK_INTERVAL_DEFAULT;
		const canCheck = await claimCheckSlot('youtube_rss', interval);
		if (!canCheck) return;
	}

	try {
		const apiKey = YOUTUBE_API_KEY;
		if (!apiKey) {
			console.warn('[YouTube Poller] YOUTUBE_API_KEY is not defined. Skipping check.');
			return;
		}

		// RSS + videos.list (1 quota unit)
		const liveFromRss = await checkViaRss(apiKey);
		if (liveFromRss) return;

		// No live stream found — only mark offline if currently live
		const current = globalAny[GLOBAL_KEY];
		if (current && current.isLive) {
			updateStatus({ ...INITIAL_STATUS, updatedAt: new Date().toISOString() });
		} else if (!current?.updatedAt) {
			updateStatus({ ...INITIAL_STATUS, updatedAt: new Date().toISOString() });
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[YouTube Poller] Error: ${message}`);
	}
}

/**
 * Called by the WebSub webhook when a push notification arrives.
 * Checks a specific video ID to see if it's a live stream.
 * Costs 1 quota unit.
 */
export async function checkVideoLiveStatus(videoId: string, apiKey: string): Promise<void> {
	try {
		const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${videoId}&key=${apiKey}`;
		const response = await fetch(apiUrl);

		if (!response.ok) {
			console.error(`[YouTube WebSub] videos.list failed: ${response.status}`);
			return;
		}

		const data = (await response.json()) as VideoListResponse;
		const liveItem = data.items?.find((item) => item.snippet.liveBroadcastContent === 'live');

		if (liveItem) {
			await applyLiveStatus(liveItem.id, liveItem.snippet);
		} else {
			// Video exists but isn't live — could be a new upload or ended stream.
			// If we're currently showing this video as live, mark offline.
			const current = globalAny[GLOBAL_KEY];
			if (current?.isLive && current?.videoId === videoId) {
				console.log(`[YouTube WebSub] Stream ended for: ${videoId}`);
				updateStatus({ ...INITIAL_STATUS, updatedAt: new Date().toISOString() });
			}
		}
	} catch (error) {
		console.error(`[YouTube WebSub] Check error: ${error instanceof Error ? error.message : error}`);
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
