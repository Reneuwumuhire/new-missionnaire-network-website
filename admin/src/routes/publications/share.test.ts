import { beforeEach, expect, it, vi } from 'vitest';
import { ObjectId } from 'mongodb';

const { getDb, findOne, updateOne } = vi.hoisted(() => ({
	getDb: vi.fn(),
	findOne: vi.fn(),
	updateOne: vi.fn()
}));

vi.mock('../../db/mongo', () => ({ getDb }));
vi.mock('$lib/models/admin-user', () => ({
	getPermissions: () => ({ can_manage_extraits: true })
}));
vi.mock('$lib/server/s3', () => ({ getS3Url: vi.fn(), deleteObject: vi.fn() }));

import { actions, load } from './+page.server';

const id = new ObjectId();
const event = (fields: Record<string, string>) => ({
	request: new Request('https://admin.missionnaire.net/publications', {
		method: 'POST',
		body: new URLSearchParams(fields)
	}),
	locals: { user: { email: 'editor@example.com' } }
});

beforeEach(() => {
	vi.clearAllMocks();
	getDb.mockResolvedValue({ collection: () => ({ findOne, updateOne }) });
	updateOne.mockResolvedValue({ matchedCount: 1 });
});

it('records and reverses a channel share only for the expected post state', async () => {
	await expect(actions.share!(event({ targetId: id.toString() }) as any)).rejects.toMatchObject({
		status: 303,
		location: '/publications?managed=shared'
	});
	expect(updateOne).toHaveBeenLastCalledWith(
		{ _id: id, status: 'published', channelSharedAt: { $exists: false } },
		{ $set: { channelSharedAt: expect.any(Date) } }
	);

	await expect(actions.share!(event({ undo: id.toString() }) as any)).rejects.toMatchObject({
		status: 303,
		location: '/publications?managed=unshared'
	});
	expect(updateOne).toHaveBeenLastCalledWith(
		{ _id: id, channelSharedAt: { $exists: true } },
		{ $unset: { channelSharedAt: '' } }
	);
});

it('clears the share marker when the website text changes', async () => {
	findOne.mockResolvedValue({ _id: id, text: 'Old text', image: '' });
	await expect(
		actions.save!(
			event({
				postId: id.toString(),
				sourceTitle: 'A source',
				body: 'New text',
				publishedAt: '2026-10-12T12:00',
				intent: 'draft'
			}) as any
		)
	).rejects.toMatchObject({ status: 303 });
	expect(updateOne.mock.calls[0][1]).toMatchObject({
		$set: { text: 'New text' },
		$unset: { channelSharedAt: '' }
	});
});

it('shows archived posts even when no posts were created in Admin', async () => {
	getDb.mockResolvedValue({
		collection: () => ({
			find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => [] }) }) })
		})
	});
	const archived = {
		id: 'WA202610012220',
		publishedAt: '2026-10-01T20:20:00.000Z',
		sourceTitle: 'A source',
		excerpt: 'An earlier channel post'
	};
	const fetch = vi.fn().mockResolvedValue(
		new Response(JSON.stringify({ posts: [archived] }), {
			status: 200,
			headers: { 'content-type': 'application/json' }
		})
	);
	const data = (await load({
		locals: { user: { email: 'editor@example.com' } },
		url: new URL('https://admin.missionnaire.net/publications'),
		fetch
	} as any)) as any;
	expect(data.recent).toEqual([]);
	expect(data.archived).toEqual([archived]);
	expect(data.archiveUnavailable).toBe(false);
	expect(fetch).toHaveBeenCalledWith(
		expect.stringMatching(/\/api\/publications\/archive$/),
		expect.objectContaining({ signal: expect.any(AbortSignal) })
	);
});
