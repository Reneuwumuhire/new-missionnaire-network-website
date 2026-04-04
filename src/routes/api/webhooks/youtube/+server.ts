import { YOUTUBE_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import { checkVideoLiveStatus } from '$lib/server/youtube-poller';

/**
 * YouTube WebSub (PubSubHubbub) Webhook
 *
 * GET  — Hub verification: Google sends a challenge to confirm we own this URL.
 * POST — Push notification: Google sends Atom XML when a video is published/updated.
 */

/** Hub verification — return the challenge token to confirm subscription. */
export const GET: RequestHandler = async ({ url }) => {
	const challenge = url.searchParams.get('hub.challenge');
	const mode = url.searchParams.get('hub.mode');
	const topic = url.searchParams.get('hub.topic');

	console.log(`[WebSub] Verification request: mode=${mode}, topic=${topic}`);

	if (challenge) {
		// Return the challenge as plain text to confirm subscription
		return new Response(challenge, {
			status: 200,
			headers: { 'Content-Type': 'text/plain' }
		});
	}

	return new Response('Missing hub.challenge', { status: 400 });
};

/** Push notification — parse the Atom XML to extract the video ID, then check if it's live. */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.text();
		console.log('[WebSub] Received push notification');

		// Extract video ID from Atom XML
		// Format: <yt:videoId>VIDEO_ID</yt:videoId>
		const videoIdMatch = body.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
		if (!videoIdMatch) {
			console.log('[WebSub] No video ID found in notification');
			return new Response('OK', { status: 200 });
		}

		const videoId = videoIdMatch[1];
		console.log(`[WebSub] Video notification for: ${videoId}`);

		// Check if this video is a live stream (costs 1 quota unit)
		const apiKey = YOUTUBE_API_KEY;
		if (apiKey) {
			checkVideoLiveStatus(videoId, apiKey).catch((e) =>
				console.error('[WebSub] Live status check error:', e)
			);
		}

		return new Response('OK', { status: 200 });
	} catch (error) {
		console.error('[WebSub] Error processing notification:', error);
		return new Response('OK', { status: 200 }); // Always return 200 to avoid retries
	}
};
