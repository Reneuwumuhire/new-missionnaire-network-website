import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createIndex: vi.fn(async () => 'transcriptions_list_desc'),
	aggregate: vi.fn(() => ({ toArray: async () => [] }))
}));

vi.mock('../../db/mongo', () => ({
	getDb: async () => ({ collection: () => mocks })
}));

import { queryTranscriptions } from './transcriptions';

it('groups stored PDF keys before counting and paging without projecting full text', async () => {
	await queryTranscriptions({ page: 2, limit: 100 });

	expect(mocks.aggregate).toHaveBeenCalledWith(
		expect.arrayContaining([
			{ $project: expect.not.objectContaining({ library_search: expect.anything() }) },
			{ $group: expect.objectContaining({ document: { $first: '$$ROOT' } }) },
			{
				$facet: {
					documents: expect.arrayContaining([{ $skip: 100 }, { $limit: 100 }]),
					count: [{ $count: 'total' }]
				}
			}
		]),
		{ collation: { locale: 'fr', numericOrdering: true } }
	);
});
