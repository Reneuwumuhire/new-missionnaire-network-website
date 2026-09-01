import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	cachedIngest,
	missionnaireIngestForAuthorization,
	studioDeviceMetadata
} from './studio-ingest';

const mocks = vi.hoisted(() => ({
	getDb: vi.fn()
}));

vi.mock('../../db/mongo', () => ({ getDb: mocks.getDb }));

beforeEach(() => {
	mocks.getDb.mockReset();
});

describe('Studio ingest credential cache', () => {
	const now = Date.now();
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

	it('does not return a credential replaced during an in-flight status request', async () => {
		const updateOne = vi.fn().mockResolvedValue({ matchedCount: 0 });
		mocks.getDb.mockResolvedValue({
			collection: () => ({
				findOne: vi.fn().mockResolvedValue({
					code: 'pairing-code',
					expires_at: new Date(now + 4 * 60 * 60 * 1000),
					missionnaire_ingest: credential
				}),
				updateOne
			})
		});

		await expect(missionnaireIngestForAuthorization('pairing-code')).rejects.toThrow(
			'authorization is no longer active'
		);
		expect(updateOne).toHaveBeenCalledWith(
			expect.objectContaining({ missionnaire_ingest: credential }),
			expect.anything()
		);
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
