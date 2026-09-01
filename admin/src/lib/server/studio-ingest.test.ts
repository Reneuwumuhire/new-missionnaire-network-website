import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	cachedIngest,
	missionnaireIngestForAuthorization,
	studioDeviceMetadata,
	updateStudioAuthorizationActivity
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
				installationId: '857c4709-a049-43a9-9fe2-b83c5fce22d3',
				extra: 'ignored'
			})
		).toEqual({
			os: 'macOS',
			architecture: 'a'.repeat(32),
			username: 'rene',
			deviceName: 'Studio Mac',
			appVersion: '0.1.4',
			installationId: '857c4709-a049-43a9-9fe2-b83c5fce22d3'
		});
	});

	it('rejects non-object metadata', () => {
		expect(studioDeviceMetadata('Windows')).toBeNull();
	});

	it('removes an older authorization for the same installation', async () => {
		const deleteMany = vi.fn().mockResolvedValue({ deletedCount: 1 });
		const collection = {
			updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
			findOne: vi.fn().mockResolvedValue({ _id: 'current', user_email: 'rene@example.com' }),
			find: vi.fn().mockReturnValue({ toArray: () => Promise.resolve([{ _id: 'old' }]) }),
			deleteMany
		};
		mocks.getDb.mockResolvedValue({ collection: () => collection });

		await updateStudioAuthorizationActivity('current-code', {
			os: 'macOS',
			architecture: 'aarch64',
			username: 'rene',
			deviceName: 'renes-mac-mini',
			appVersion: '0.1.12',
			installationId: '857c4709-a049-43a9-9fe2-b83c5fce22d3'
		});

		expect(collection.find).toHaveBeenCalledWith(
			expect.objectContaining({ user_email: 'rene@example.com' })
		);
		expect(deleteMany).toHaveBeenCalledWith({ _id: { $in: ['old'] } });
	});
});
