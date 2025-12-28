// import ytdl from '@distube/ytdl-core';
// removed ytdl usage
import cookieFileContent from '../../../cookies.txt?raw';

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
const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
let isChecking = false;

function parseCookieFile(content: string): string[] {
	const cookies: string[] = [];
	const lines = content.split('\n');
	for (const line of lines) {
		if (line.startsWith('#') || !line.trim()) continue;
		const parts = line.split('\t');
		if (parts.length >= 7) {
			const name = parts[5];
			const value = parts[6].trim();
			if (name && value) {
				cookies.push(`${name}=${value}`);
			}
		}
	}
	return cookies;
}

function getCookies(): string {
	try {
		// Priority 1: Use bundled cookie file content
		if (cookieFileContent) {
			const cookies = parseCookieFile(cookieFileContent);
			if (cookies.length > 0) {
				console.log(`[YouTube Poller] Loaded ${cookies.length} cookies from bundled file.`);
				return cookies.join('; ');
			}
		} else {
			console.warn('[YouTube Poller] Bundled cookie content is empty.');
		}
	} catch (error) {
		console.warn('[YouTube Poller] Failed to parse bundled cookies:', error);
	}

	// Priority 2: Fallback to env var
	const envCookies = process.env.YOUTUBE_COOKIES || '';
	if (envCookies) {
		console.log('[YouTube Poller] Using cookies from environment variable.');
	} else {
		console.log('[YouTube Poller] No cookies found in file or environment.');
	}
	return envCookies;
}

export async function checkAndIngestLiveStream() {
	if (isChecking) {
		console.log('[YouTube Poller] Check already in progress, skipping');
		return;
	}

	isChecking = true;
	console.log(`[YouTube Poller] Checking for livestream at ${new Date().toISOString()}`);

	try {
		const cookies = getCookies();
		const headers: Record<string, string> = {
			'User-Agent': USER_AGENT,
			Accept:
				'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
			'Accept-Language': 'en-US,en;q=0.9'
		};

		if (cookies) {
			console.log('[YouTube Poller] Using provided cookies for authentication');
			headers['Cookie'] = cookies;
		}

		let text = ''; // Declare text variable in outer scope

		// 1. Check for live video redirection OR inline content
		const response = await fetch(CHANNEL_URL, {
			method: 'GET',
			redirect: 'follow',
			headers: headers
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
			const pageText = await response.text();
			text = pageText; // Assign to outer scope variable

			// Check for title to debug blocks
			const titleMatch = pageText.match(/<title>(.*?)<\/title>/);
			if (titleMatch) {
				console.log(`[YouTube Poller DEBUG] Page Title: ${titleMatch[1]}`);
			}

			const match = pageText.match(/"videoId":"([^"]+)"/);
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

		// Check for specific "Live" markers in the HTML
		// Common patterns: "status":"LIVE", "iconType":"LIVE", "isLive":true
		const isLiveMatch =
			text.match(/"status":"LIVE"/) ||
			text.match(/"iconType":"LIVE"/) ||
			text.match(/"isLive":true/);
		const isLive = !!isLiveMatch;

		// Extract title if not already found (channel page title usually has " - YouTube")
		let title = null;
		const titleMatch = text.match(/<title>(.*?)<\/title>/);
		if (titleMatch) {
			title = titleMatch[1].replace(' - YouTube', '');
		}

		console.log(
			`[YouTube Poller] Manual Scrape Result -> Video: ${videoId}, Title: ${title}, Live: ${isLive}`
		);

		// 4. Update In-Memory Status (Bypassing ytdl-core to avoid bot detection)
		updateStatus({
			isLive: isLive,
			videoId: isLive ? videoId : null,
			title: isLive ? title : null,
			url: isLive ? `https://www.youtube.com/watch?v=${videoId}` : null,
			updatedAt: new Date().toISOString()
		});

		console.log(`[YouTube Poller] Successfully updated livestream status (In-Memory).`);

		console.log(`[YouTube Poller] Successfully updated livestream status (In-Memory).`);
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
