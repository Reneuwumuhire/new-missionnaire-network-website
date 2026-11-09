import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { claimCheckSlot } from '../../../../db/collections';
import { checkVideoLiveStatus } from '$lib/server/youtube-poller';
import { YOUTUBE_CHANNEL_ID, YOUTUBE_TOPIC_URL } from '$lib/server/youtube-websub';

/**
 * YouTube WebSub (PubSubHubbub) Webhook
 *
 * GET  — Hub verification: return a challenge only for the configured topic.
 * POST — Signed Atom notification for the subscribed YouTube channel.
 */

const MAX_NOTIFICATION_BYTES = 64 * 1024;
const MIN_VIDEO_CHECK_INTERVAL_MS = 30_000;

function webSubSecret(): string | null {
	return env.YOUTUBE_WEBSUB_SECRET?.trim() || env.INTERNAL_API_SECRET?.trim() || null;
}

async function readBoundedBody(request: Request): Promise<Uint8Array | null> {
	const contentLength = request.headers.get('content-length');
	if (contentLength && Number(contentLength) > MAX_NOTIFICATION_BYTES) return null;

	const reader = request.body?.getReader();
	if (!reader) return new Uint8Array();

	let size = 0;
	const chunks: Uint8Array[] = [];
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > MAX_NOTIFICATION_BYTES) {
				await reader.cancel();
				return null;
			}
			chunks.push(value);
		}
		const body = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) {
			body.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return body;
	} finally {
		reader.releaseLock();
	}
}

function hasValidSignature(
	body: Uint8Array,
	signature: string | null,
	secret: string | null
): boolean {
	const match = /^sha1=([a-f0-9]{40})$/i.exec(signature ?? '');
	if (!secret || !match) return false;

	const expected = createHmac('sha1', secret).update(body).digest();
	const received = Buffer.from(match[1], 'hex');
	return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Hub verification — echo challenges only for the subscribed channel. */
export const GET: RequestHandler = async ({ url }) => {
	const challenge = url.searchParams.get('hub.challenge');
	const mode = url.searchParams.get('hub.mode');
	const topic = url.searchParams.get('hub.topic');

	if (
		!challenge ||
		(mode !== 'subscribe' && mode !== 'unsubscribe') ||
		topic !== YOUTUBE_TOPIC_URL
	) {
		return new Response('Invalid WebSub verification request', { status: 404 });
	}

	return new Response(challenge, {
		status: 200,
		headers: { 'Content-Type': 'text/plain' }
	});
};

/** Process only bounded, HMAC-authenticated notifications for our channel. */
export const POST: RequestHandler = async ({ request }) => {
	const rawBody = await readBoundedBody(request);
	if (rawBody === null) return new Response('Notification too large', { status: 413 });

	// WebSub recommends acknowledging invalid notifications so the hub does not
	// retry them; importantly, never make a YouTube API request for one.
	if (!hasValidSignature(rawBody, request.headers.get('x-hub-signature'), webSubSecret())) {
		return new Response('OK', { status: 202 });
	}

	let body: string;
	try {
		body = new TextDecoder('utf-8', { fatal: true }).decode(rawBody);
	} catch {
		return new Response('OK', { status: 202 });
	}

	const channelId = /<yt:channelId>([^<]+)<\/yt:channelId>/.exec(body)?.[1];
	const videoId = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(body)?.[1];
	if (
		channelId !== YOUTUBE_CHANNEL_ID ||
		!videoId ||
		!/^[A-Za-z0-9_-]{11}$/.test(videoId)
	) {
		return new Response('OK', { status: 202 });
	}

	// Cap API quota use if the hub retries or sends a burst of rapid updates.
	if (!(await claimCheckSlot('youtube_websub_video_check', MIN_VIDEO_CHECK_INTERVAL_MS))) {
		return new Response('OK', { status: 202 });
	}

	const apiKey = env.YOUTUBE_API_KEY;
	if (apiKey) {
		checkVideoLiveStatus(videoId, apiKey).catch((error) =>
			console.error('[WebSub] Live status check error:', error)
		);
	}

	return new Response('OK', { status: 202 });
};
