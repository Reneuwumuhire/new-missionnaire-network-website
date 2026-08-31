import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const INGEST_TTL_MS = 12 * 60 * 60 * 1000;

function signature(secret: string, path: string, expiresAt: number): Buffer {
	return createHmac('sha256', secret).update(`${path}\0${expiresAt}`).digest();
}

export function createIngestCredential(
	secret: string,
	baseUrl: string,
	now = Date.now(),
	id: string = randomUUID()
): { url: string; key: string; expiresAt: string } {
	const url = new URL(baseUrl);
	if (url.protocol !== 'rtmp:' && url.protocol !== 'rtmps:') {
		throw new Error('RTMP_PUBLIC_URL must use rtmp:// or rtmps://');
	}
	const basePath = url.pathname.replace(/^\/+|\/+$/g, '');
	url.pathname = basePath;
	const path = basePath ? `${basePath}/${id}` : id;
	const expiresAt = now + INGEST_TTL_MS;
	const token = `${expiresAt}.${signature(secret, path, expiresAt).toString('base64url')}`;
	return {
		url: url.toString().replace(/\/$/, ''),
		key: `${id}?token=${token}`,
		expiresAt: new Date(expiresAt).toISOString()
	};
}

export function verifyIngestCredential(
	secret: string,
	path: string,
	token: string,
	now = Date.now()
): boolean {
	const separator = token.indexOf('.');
	if (separator < 1) return false;
	const expiresText = token.slice(0, separator);
	if (!/^\d{13}$/.test(expiresText)) return false;
	const expiresAt = Number(expiresText);
	if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;
	let received: Buffer;
	try {
		received = Buffer.from(token.slice(separator + 1), 'base64url');
	} catch {
		return false;
	}
	const expected = signature(secret, path, expiresAt);
	return received.length === expected.length && timingSafeEqual(received, expected);
}
