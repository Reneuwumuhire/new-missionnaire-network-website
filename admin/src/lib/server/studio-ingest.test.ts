import { describe, expect, it } from 'vitest';
import { cachedIngest, studioDeviceMetadata } from './studio-ingest';

describe('Studio ingest credential cache', () => {
	const now = Date.UTC(2026, 7, 31, 12);
	const credential = {
		url: 'rtmps://stream.example/live',
		key: '2aa334c8-a73d-44ab-a2fe-559cd7397779?token=signed',
		expiresAt: new Date(now + 2 * 60 * 60 * 1000).toISOString()
	};

	it('reuses a session credential until it is within 30 minutes of expiry', () => {
		expect(cachedIngest(credential, now)).toEqual(credential);
		expect(
			cachedIngest({ ...credential, expiresAt: new Date(now + 29 * 60 * 1000).toISOString() }, now)
		).toBeNull();
	});
});

describe('Studio device metadata', () => {
	it('keeps only bounded display strings from the desktop app', () => {
		expect(
			studioDeviceMetadata({
				os: 'macOS\u0000',
				architecture: 'a'.repeat(40),
				username: ' rene ',
				deviceName: 'Studio Mac',
				appVersion: '0.1.4',
				extra: 'ignored'
			})
		).toEqual({
			os: 'macOS',
			architecture: 'a'.repeat(32),
			username: 'rene',
			deviceName: 'Studio Mac',
			appVersion: '0.1.4'
		});
	});

	it('rejects non-object metadata', () => {
		expect(studioDeviceMetadata('Windows')).toBeNull();
	});
});
