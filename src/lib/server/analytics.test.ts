import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	aggregate: vi.fn((_pipeline: unknown[], _options: unknown) => ({
		toArray: async () => [
			{
				totalVisitors: [{ value: 12 }],
				todayVisitors: [{ value: 3 }],
				dailyAverage: [{ value: 2.6 }],
				monthlyAverage: [{ value: 9.4 }],
				distributions: [
					{ _id: { kind: 'country', value: 'RW' }, count: 7 },
					{ _id: { kind: 'country', value: 'Rwanda' }, count: 2 },
					{ _id: { kind: 'device', value: 'Mobile' }, count: 9 }
				]
			}
		]
	}))
}));

vi.mock('../../db/mongo', () => ({
	getDb: async () => ({ collection: () => ({ aggregate: mocks.aggregate }) })
}));

import { getAnalyticsStats } from './analytics';

it('loads all public analytics in one aggregation and merges country aliases', async () => {
	await expect(getAnalyticsStats()).resolves.toEqual({
		totalVisitors: 12,
		todayVisitors: 3,
		dailyAverage: 3,
		monthlyAverage: 9,
		topCountries: [{ name: 'Rwanda', count: 9 }],
		deviceStats: [{ type: 'Mobile', count: 9 }]
	});
	expect(mocks.aggregate).toHaveBeenCalledOnce();
	expect(mocks.aggregate).toHaveBeenCalledWith(expect.any(Array), { allowDiskUse: true });
	expect(mocks.aggregate.mock.calls[0][0]).toContainEqual({
		$match: { device: { $ne: 'Bot' }, pageViews: { $gt: 1 } }
	});
});
