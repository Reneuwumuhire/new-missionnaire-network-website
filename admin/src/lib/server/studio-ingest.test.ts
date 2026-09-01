import { describe, expect, it } from 'vitest';
import { cachedIngest } from './studio-ingest';

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
