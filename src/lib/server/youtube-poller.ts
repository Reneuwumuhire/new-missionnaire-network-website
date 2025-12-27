import ytdl from '@distube/ytdl-core';

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
	console.log('[YouTube Poller DEBUG] getLiveStatus called. Value:', status);
	return status;
}

function updateStatus(newStatus: LiveStatus) {
	// @ts-ignore
	globalThis[GLOBAL_KEY] = newStatus;
}

const CHANNEL_URL = 'https://www.youtube.com/@MissionnaireNetwork/live';
let isChecking = false;

export async function checkAndIngestLiveStream() {
	if (isChecking) {
		console.log('[YouTube Poller] Check already in progress, skipping');
		return;
	}

	isChecking = true;
	console.log(`[YouTube Poller] Checking for livestream at ${new Date().toISOString()}`);

	try {
		// 1. Check for live video redirection OR inline content
		const response = await fetch(CHANNEL_URL, {
			method: 'GET',
			redirect: 'follow',
			headers: {
				'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
			}
		});

		const finalUrl = response.url;
		console.log(`[YouTube Poller] Final URL: ${finalUrl}`);

		let videoId: string | null = null;

		if (finalUrl.includes('watch?v=')) {
			// Redirected to watch page locally
			const urlObj = new URL(finalUrl);
			videoId = urlObj.searchParams.get('v');
		} else {
			// No redirect, check page content for video ID
			const text = await response.text();
			const match = text.match(/"videoId":"([^"]+)"/);
			if (match && match[1]) {
				videoId = match[1];
				console.log(`[YouTube Poller] Extracted video ID from HTML: ${videoId}`);
			}
		}

		if (!videoId) {
			console.log('[YouTube Poller] No active livestream found (no video ID in URL or HTML)');

			// Update status in-memory
			updateStatus({
				isLive: false,
				videoId: null,
				title: null,
				url: null,
				updatedAt: new Date().toISOString()
			});
			return;
		}

		console.log(`[YouTube Poller] Found potential live video: ${videoId}`);

		// 3. Get Video Info
		const info = await ytdl.getBasicInfo(videoId);
		// @ts-ignore
		const videoDetails = info.videoDetails;

		// Check if it's actually live or upcoming
		const isLive = videoDetails.isLiveContent;

		console.log(`[YouTube Poller] Updating Live Status: ${isLive} (Video: ${videoDetails.title})`);

		// 4. Update In-Memory Status
		updateStatus({
			isLive: isLive,
			videoId: isLive ? videoId : null,
			title: isLive ? videoDetails.title : null,
			url: isLive ? videoDetails.video_url : null,
			updatedAt: new Date().toISOString()
		});

		console.log(`[YouTube Poller] Successfully updated livestream status (In-Memory).`);
	} catch (error) {
		console.error('[YouTube Poller] Error checking for livestream:', error);
	} finally {
		isChecking = false;
	}
}
