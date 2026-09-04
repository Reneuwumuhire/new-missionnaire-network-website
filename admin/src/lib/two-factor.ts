import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTwoFactorSecret(): string {
	return encodeBase32(randomBytes(20));
}

export function encodeBase32(input: Uint8Array): string {
	let bits = 0;
	let value = 0;
	let output = '';

	for (const byte of input) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			output += BASE32[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}

	if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
	return output;
}

function decodeBase32(input: string): Buffer {
	let bits = 0;
	let value = 0;
	const output: number[] = [];

	for (const char of input.toUpperCase().replace(/[^A-Z2-7]/g, '')) {
		const index = BASE32.indexOf(char);
		if (index < 0) continue;
		value = (value << 5) | index;
		bits += 5;
		if (bits >= 8) {
			output.push((value >>> (bits - 8)) & 255);
			bits -= 8;
		}
	}

	return Buffer.from(output);
}

export function totpCode(secret: string, timestamp = Date.now()): string {
	const counter = Math.floor(timestamp / 30_000);
	const buffer = Buffer.alloc(8);
	buffer.writeBigUInt64BE(BigInt(counter));
	const digest = createHmac('sha1', decodeBase32(secret)).update(buffer).digest();
	const offset = digest[digest.length - 1] & 15;
	const binary =
		((digest[offset] & 127) << 24) |
		((digest[offset + 1] & 255) << 16) |
		((digest[offset + 2] & 255) << 8) |
		(digest[offset + 3] & 255);
	return String(binary % 1_000_000).padStart(6, '0');
}

export function verifyTotp(secret: string, code: string, timestamp = Date.now()): boolean {
	const normalized = code.replace(/\s/g, '');
	if (!/^\d{6}$/.test(normalized)) return false;
	return [-30_000, 0, 30_000].some((offset) =>
		safeEqual(totpCode(secret, timestamp + offset), normalized)
	);
}

export function generateRecoveryCodes(count = 8): string[] {
	return Array.from({ length: count }, () => {
		const value = randomBytes(5).toString('hex').toUpperCase();
		return `${value.slice(0, 5)}-${value.slice(5)}`;
	});
}

export function hashRecoveryCode(code: string, key: string): string {
	return createHmac('sha256', key).update(normalizeRecoveryCode(code)).digest('hex');
}

export function encryptTwoFactorSecret(secret: string, key: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', encryptionKey(key), iv);
	const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
	return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptTwoFactorSecret(value: string, key: string): string {
	const [ivValue, tagValue, encryptedValue] = value.split('.');
	if (!ivValue || !tagValue || !encryptedValue) throw new Error('Invalid encrypted secret');
	const decipher = createDecipheriv(
		'aes-256-gcm',
		encryptionKey(key),
		Buffer.from(ivValue, 'base64url')
	);
	decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
	return Buffer.concat([
		decipher.update(Buffer.from(encryptedValue, 'base64url')),
		decipher.final()
	]).toString('utf8');
}

export function buildOtpAuthUri(secret: string, email: string): string {
	const issuer = 'Missionnaire Admin';
	return `otpauth://totp/${encodeURIComponent(`${issuer}:${email}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
}

function normalizeRecoveryCode(code: string): string {
	return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function encryptionKey(key: string): Buffer {
	return createHmac('sha256', 'missionnaire-admin-2fa').update(key).digest();
}

function safeEqual(left: string, right: string): boolean {
	const a = Buffer.from(left);
	const b = Buffer.from(right);
	return a.length === b.length && timingSafeEqual(a, b);
}
