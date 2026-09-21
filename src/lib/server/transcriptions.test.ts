import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const cursor = {
		project: vi.fn(),
		sort: vi.fn(),
		collation: vi.fn(),
		skip: vi.fn(),
		limit: vi.fn(),
		toArray: vi.fn(async () => [])
	};
	for (const method of ['project', 'sort', 'collation', 'skip', 'limit'] as const) {
		cursor[method].mockReturnValue(cursor);
	}
	return {
		cursor,
		createIndex: vi.fn(async () => 'transcriptions_list_desc'),
		countDocuments: vi.fn(async () => 0),
		find: vi.fn(() => cursor)
	};
});

vi.mock('../../db/mongo', () => ({
	getDb: async () => ({
		collection: () => ({
			createIndex: mocks.createIndex,
			countDocuments: mocks.countDocuments,
			find: mocks.find
		})
	})
}));

import { queryTranscriptions } from './transcriptions';

it('uses the transcription list index without loading full-text data', async () => {
	await queryTranscriptions({});

	expect(mocks.createIndex).toHaveBeenCalledWith(
		{ publishedOn: -1, filename: -1, _id: -1 },
		{
			name: 'transcriptions_list_desc',
			collation: { locale: 'fr', numericOrdering: true }
		}
	);
	expect(mocks.cursor.project).toHaveBeenCalledWith({ library_search: 0 });
});
