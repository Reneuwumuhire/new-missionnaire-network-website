import { beforeEach, expect, it, vi } from 'vitest';
import {
	canAccessStudioTest,
	getScheduledLiveBySlug,
	setScheduledLiveRecordingId
} from '../../db/collections';
import { getPublishedById, getPublishedNearSession } from './recordings';
import { getWatchState } from './scheduled-lives';

vi.mock('../../db/collections', () => ({
	getScheduledLiveBySlug: vi.fn(),
	getBroadcastAdminState: vi.fn(async () => ({ is_live: false })),
	getRadioCachedStatus: vi.fn(async () => null),
	setScheduledLiveRecordingId: vi.fn(),
	canAccessStudioTest: vi.fn()
}));

vi.mock('./recordings', () => ({
	getPublishedById: vi.fn(),
	getPublishedNearSession: vi.fn()
}));

const service = {
	_id: 'service',
	status: 'ended',
	scheduled_at: '2026-11-25T18:30:00Z'
} as const;

beforeEach(() => vi.resetAllMocks());

it('keeps the watch page pending when its linked replay is unpublished', async () => {
	vi.mocked(getScheduledLiveBySlug).mockResolvedValue({
		...service,
		recording_id: 'linked'
	} as NonNullable<Awaited<ReturnType<typeof getScheduledLiveBySlug>>>);
	vi.mocked(getPublishedById).mockResolvedValue(null);

	await expect(getWatchState('service')).resolves.toMatchObject({
		phase: 'ended_pending',
		replayPath: null
	});
	expect(getPublishedById).toHaveBeenCalledWith('linked');
	expect(getPublishedNearSession).not.toHaveBeenCalled();
	expect(setScheduledLiveRecordingId).not.toHaveBeenCalled();
});

it('still looks up a replay by service time for older unlinked services', async () => {
	vi.mocked(getScheduledLiveBySlug).mockResolvedValue({
		...service,
		recording_id: null
	} as NonNullable<Awaited<ReturnType<typeof getScheduledLiveBySlug>>>);
	vi.mocked(getPublishedNearSession).mockResolvedValue(null);

	await expect(getWatchState('service')).resolves.toMatchObject({ phase: 'ended_pending' });
	expect(getPublishedNearSession).toHaveBeenCalledWith(service.scheduled_at);
});

it('does not backfill a private rehearsal with a nearby public replay', async () => {
	vi.mocked(getScheduledLiveBySlug).mockResolvedValue({
		...service,
		is_test: true,
		recording_id: null
	} as NonNullable<Awaited<ReturnType<typeof getScheduledLiveBySlug>>>);
	vi.mocked(canAccessStudioTest).mockResolvedValue(true);

	await expect(getWatchState('service', 'token')).resolves.toMatchObject({
		phase: 'ended_pending',
		replayPath: null
	});
	expect(getPublishedNearSession).not.toHaveBeenCalled();
	expect(setScheduledLiveRecordingId).not.toHaveBeenCalled();
});
