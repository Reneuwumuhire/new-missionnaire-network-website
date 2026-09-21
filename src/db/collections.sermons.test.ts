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

vi.mock('./mongo', () => ({
	getDb: async () => ({
		collection: () => ({
			createIndexes: mocks.createIndexes,
			countDocuments: mocks.countDocuments,
			find: mocks.find
		})
	})
}));

import { querySermons } from './collections';

it('indexes supported sermon sorts and omits search text from list results', async () => {
	await querySermons({ orderBy: 'library_search:asc' });

	expect(mocks.createIndexes).toHaveBeenCalledWith([
		{ key: { french_title: 1 } },
		{ key: { author: 1 } },
		{ key: { iso_date: 1 } },
		{ key: { duration: 1 } }
	]);
	expect(mocks.cursor.project).toHaveBeenCalledWith({ library_search: 0 });
	expect(mocks.cursor.sort).toHaveBeenCalledWith({ iso_date: -1 });
});
