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
 * Live-stream detection via RSS + videos.list.
 *
 * RSS feed is free, videos.list costs 1 quota unit per call.
 * Throttled via DB lock so only one serverless instance checks per interval.
 *
 * Quota budget: ~288 units/day (1 unit every 5 min)
 */
export async function checkAndIngestLiveStream() {
	// DB-level throttle — prevents multiple serverless instances from checking
	const canCheck = await claimCheckSlot('youtube_rss', CHECK_INTERVAL);
	if (!canCheck) return;

	try {
		const apiKey = YOUTUBE_API_KEY;
		if (!apiKey) {
			console.warn('[YouTube Poller] YOUTUBE_API_KEY is not defined. Skipping check.');
			return;
		}

		const liveFromRss = await checkViaRss(apiKey);
		if (!liveFromRss) {
			// No live stream found — update status to offline
			updateStatus({ ...INITIAL_STATUS, updatedAt: new Date().toISOString() });
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[YouTube Poller] Error: ${message}`);
		updateStatus({ ...INITIAL_STATUS, updatedAt: new Date().toISOString() });
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
