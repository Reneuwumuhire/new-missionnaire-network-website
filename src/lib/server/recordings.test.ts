import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const cursor = {
		project: vi.fn(),
		sort: vi.fn(),
		skip: vi.fn(),
		limit: vi.fn(),
		toArray: vi.fn(async () => [])
	};
	for (const method of ['project', 'sort', 'skip', 'limit'] as const) {
		cursor[method].mockReturnValue(cursor);
	}
	return {
		cursor,
		createIndexes: vi.fn(async () => []),
		countDocuments: vi.fn(async () => 0),
		find: vi.fn(() => cursor)
	};
});

vi.mock('../../db/mongo', () => ({
	getDb: async () => ({
		collection: () => ({
			createIndexes: mocks.createIndexes,
			countDocuments: mocks.countDocuments,
			find: mocks.find
		})
	})
}));

import { listRetransmissions } from './recordings';

it('indexes recording list sorts and excludes full-text data', async () => {
	await listRetransmissions({ sortField: 'library_search' });

	expect(mocks.createIndexes).toHaveBeenCalledWith([
		{
			key: { published: 1, status: 1, started_at: -1 },
			name: 'pub_status_startedAt_desc'
		},
		{ key: { published: 1, status: 1, title: 1 }, name: 'pub_status_title_asc' },
		{
			key: { published: 1, status: 1, duration_sec: 1 },
			name: 'pub_status_duration_asc'
		}
	]);
	expect(mocks.cursor.project).toHaveBeenCalledWith({ library_search: 0 });
	expect(mocks.cursor.sort).toHaveBeenCalledWith({ started_at: -1 });
});
