import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export function youtubeBroadcastId(value: string): string | null {
	const text = value.trim();
	if (/^[A-Za-z0-9_-]{11}$/.test(text)) return text;
	try {
		const url = new URL(text);
		if (url.hostname === 'youtu.be') return /^[A-Za-z0-9_-]{11}$/.test(url.pathname.slice(1)) ? url.pathname.slice(1) : null;
		if (!/(^|\.)youtube\.com$/.test(url.hostname)) return null;
		const id = url.searchParams.get('v') ?? url.pathname.match(/^\/(?:live|embed)\/([A-Za-z0-9_-]{11})/)?.[1] ?? null;
		return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
	} catch {
		return null;
	}
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

export function authorizationUrl(input: { clientId: string; redirectUri: string; state: string }): string {
	const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
	url.search = new URLSearchParams({
		client_id: input.clientId,
		redirect_uri: input.redirectUri,
		response_type: 'code',
		scope: 'https://www.googleapis.com/auth/youtube.force-ssl',
		access_type: 'offline',
		prompt: 'consent',
		state: input.state
	}).toString();
	return url.toString();
}
