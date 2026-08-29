import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const YOUTUBE_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;

export function validateYouTubeThumbnail(
	contentType: string,
	size: number
): 'image/jpeg' | 'image/png' {
	const normalized = contentType.split(';', 1)[0].trim().toLowerCase();
	if (normalized !== 'image/jpeg' && normalized !== 'image/png') {
		throw new Error('YouTube thumbnail must be a JPEG or PNG image');
	}
	if (size <= 0 || size > YOUTUBE_THUMBNAIL_MAX_BYTES) {
		throw new Error('YouTube thumbnail must be under 2 MB');
	}
	return normalized;
}

export function youtubeBroadcastId(value: string): string | null {
	const text = value.trim();
	if (/^[A-Za-z0-9_-]{11}$/.test(text)) return text;
	try {
		const url = new URL(text);
		if (url.hostname === 'youtu.be')
			return /^[A-Za-z0-9_-]{11}$/.test(url.pathname.slice(1)) ? url.pathname.slice(1) : null;
		if (!/(^|\.)youtube\.com$/.test(url.hostname)) return null;
		const id =
			url.searchParams.get('v') ??
			url.pathname.match(/^\/(?:live|embed)\/([A-Za-z0-9_-]{11})/)?.[1] ??
			null;
		return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
	} catch {
		return null;
	}
}

export function youtubeLiveStep(status: string): 'done' | 'wait' | 'start-testing' | 'start-live' {
	if (status === 'live') return 'done';
	if (status === 'testStarting' || status === 'liveStarting') return 'wait';
	if (status === 'ready') return 'start-testing';
	if (status === 'testing') return 'start-live';
	throw new Error(`YouTube broadcast cannot go live (${status})`);
}

function key(secret: string): Buffer {
	return createHash('sha256').update(`missionnaire-youtube-oauth\0${secret}`).digest();
}

export function encryptToken(token: string, secret: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
	const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
	return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptToken(value: string, secret: string): string {
	const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
	if (!iv || !tag || !encrypted) throw new Error('Invalid encrypted YouTube token');
	const decipher = createDecipheriv('aes-256-gcm', key(secret), iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function authorizationUrl(input: {
	clientId: string;
	redirectUri: string;
	state: string;
}): string {
	const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
	url.search = new URLSearchParams({
		client_id: input.clientId,
		redirect_uri: input.redirectUri,
		response_type: 'code',
		scope: 'https://www.googleapis.com/auth/youtube.force-ssl',
		access_type: 'offline',
		prompt: 'consent select_account',
		state: input.state
	}).toString();
	return url.toString();
}

export function scheduledBroadcastBody(input: {
	title: string;
	description: string | null;
	scheduledAt: Date;
	privacyStatus: 'private' | 'unlisted' | 'public';
	madeForKids: boolean;
}) {
	return {
		snippet: {
			title: input.title,
			description: input.description ?? '',
			scheduledStartTime: input.scheduledAt.toISOString()
		},
		status: {
			privacyStatus: input.privacyStatus,
			selfDeclaredMadeForKids: input.madeForKids
		},
		contentDetails: {
			enableAutoStart: false,
			enableAutoStop: false,
			enableDvr: true,
			enableEmbed: true,
			recordFromStart: true,
			monitorStream: { enableMonitorStream: true, broadcastStreamDelayMs: 0 }
		}
	};
}
