import { expect, it, vi } from 'vitest';

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock('../../db/mongo', () => ({ getDb }));
vi.mock('./publicationEngagement', () => ({
	getPublicationEngagement: async () => new Map(),
	normalizePublicationEngagement: () => ({})
}));

import { getExtraitFeed } from './extraitPosts';

it('does not revive an archived post that an editor saved as a draft', async () => {
	getDb.mockResolvedValue({
		collection: (name: string) => ({
			find: (filter: { _id?: unknown }) => ({
				toArray: async () =>
					name === 'extrait_posts' && filter._id
						? [{ _id: 'WA202610012220', status: 'draft' }]
						: [],
				sort: () => ({ limit: () => ({ toArray: async () => [] }) })
			})
		})
	});
	const feed = await getExtraitFeed();
	expect(feed.posts).toHaveLength(42);
	expect(feed.posts.some((post) => post.id === 'WA202610012220')).toBe(false);
});

it('uses a published edit once under the original archive ID', async () => {
	getDb.mockResolvedValue({
		collection: (name: string) => ({
			find: (filter: { _id?: unknown }) => ({
				toArray: async () =>
					name === 'extrait_posts' && filter._id
						? [
								{
									_id: 'WA202610012220',
									status: 'published',
									publishedAt: new Date('2026-10-01T20:20:00.000Z'),
									text: 'Edited text',
									excerpt: 'Edited text',
									bodyHtml: 'Edited text',
									image: '/img/extraits/old.jpg',
									imageWidth: 1200,
									imageHeight: 675,
									sourceTitle: 'Edited source',
									links: []
								}
							]
						: [],
				sort: () => ({ limit: () => ({ toArray: async () => [] }) })
			})
		})
	});
	const feed = await getExtraitFeed();
	expect(feed.posts.filter((post) => post.id === 'WA202610012220')).toHaveLength(1);
	expect(feed.posts.find((post) => post.id === 'WA202610012220')).toMatchObject({
		text: 'Edited text',
		sourceTitle: 'Edited source'
	});
});
