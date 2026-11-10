import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	collections: [] as string[],
	updateOne: vi.fn(async () => ({})),
	insertOne: vi.fn(async (..._args: unknown[]) => ({})),
	createIndex: vi.fn(async () => 'occurredAt_1')
}));
vi.mock('$app/environment', () => ({ dev: true }));
vi.mock('$lib/server/analytics', () => ({ getAnalyticsStats: vi.fn() }));
vi.mock('../../../db/mongo', () => ({
	getDb: async () => ({
		collection: (name: string) => {
			mocks.collections.push(name);
			return {
				updateOne: mocks.updateOne,
				insertOne: mocks.insertOne,
				createIndex: mocks.createIndex
			};
		}
	})
}));

import { POST } from './+server';

function event(body: unknown) {
	const url = new URL('http://localhost:5174/api/analytics');
	return {
		url,
		request: new Request(url, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'sec-fetch-site': 'same-origin',
				'user-agent': 'Mozilla/5.0'
			},
			body: JSON.stringify(body)
		}),
		cookies: { get: () => 'preview-visitor-id-123456789', set: vi.fn() }
	} as never;
}

it('keeps local page and play events out of production analytics collections', async () => {
	expect((await POST(event({ path: '/musique' }))).status).toBe(204);
	expect(
		(await POST(event({ event: 'playback', kind: 'song', id: 'song-1', title: 'Song' }))).status
	).toBe(204);
	expect(mocks.collections).toEqual([
		'analytics_preview_page_events',
		'analytics_preview_play_events'
	]);
	expect(mocks.updateOne).not.toHaveBeenCalled();
	expect(mocks.insertOne).toHaveBeenCalledTimes(2);
});
