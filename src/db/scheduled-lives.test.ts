import { expect, it, vi } from 'vitest';
import { getNextPublicScheduledLive } from './collections';

const { findOne } = vi.hoisted(() => ({ findOne: vi.fn() }));

vi.mock('./mongo', () => ({ getDb: async () => ({ collection: () => ({ findOne }) }) }));

it('queries upcoming services with a BSON Date and serializes the result as ISO', async () => {
	const service = {
		slug: 'krefeld',
		title: 'Krefeld broadcast',
		scheduled_at: new Date('2026-11-25T18:30:00.000Z')
	};
	findOne.mockResolvedValue(service);

	expect(await getNextPublicScheduledLive()).toEqual({
		...service,
		scheduled_at: service.scheduled_at.toISOString()
	});
	expect(findOne).toHaveBeenCalledWith(
		{
			status: 'scheduled',
			is_test: { $ne: true },
			privacy_status: { $ne: 'private' },
			scheduled_at: { $gte: expect.any(Date) }
		},
		expect.objectContaining({ sort: { scheduled_at: 1 } })
	);
});
