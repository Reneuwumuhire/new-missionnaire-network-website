import { beforeEach, expect, it, vi } from 'vitest';
import { ObjectId } from 'mongodb';

const { getDb, findOne, updateOne, insertOne } = vi.hoisted(() => ({
	getDb: vi.fn(),
	findOne: vi.fn(),
	updateOne: vi.fn(),
	insertOne: vi.fn()
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
	getDb.mockResolvedValue({ collection: () => ({ findOne, updateOne, insertOne }) });
	updateOne.mockResolvedValue({ matchedCount: 1 });
});

const archived = {
	id: 'WA202610012220',
	publishedAt: '2026-10-01T20:20:00.000Z',
	sourceTitle: 'A source',
	excerpt: 'An earlier channel post',
	text: 'An earlier channel post',
	bodyHtml: '<strong>An earlier channel post</strong>',
	image: '/img/extraits/old.jpg',
	imageWidth: 1200,
	imageHeight: 675,
	links: [{ label: 'Old link', href: '/old', kind: 'legacy' }]
};
const archiveFetch = vi.fn().mockImplementation(
	async () =>
		new Response(JSON.stringify({ posts: [archived] }), {
			status: 200,
			headers: { 'content-type': 'application/json' }
		})
);

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
			find: () => ({
				sort: () => ({ limit: () => ({ toArray: async () => [] }) }),
				toArray: async () => []
			})
		})
	});
	const data = (await load({
		locals: { user: { email: 'editor@example.com' } },
		url: new URL('https://admin.missionnaire.net/publications'),
		fetch: archiveFetch
	} as any)) as any;
	expect(data.recent).toEqual([]);
	expect(data.archived).toEqual([
		expect.objectContaining({ id: archived.id, image: archived.image })
	]);
	expect(data.archiveUnavailable).toBe(false);
	expect(archiveFetch).toHaveBeenCalledWith(
		expect.stringMatching(/\/api\/publications\/archive$/),
		expect.objectContaining({ signal: expect.any(AbortSignal) })
	);
});

it('opens an earlier post in the editor and preserves its public ID, image, and HTML', async () => {
	findOne.mockResolvedValue(null);
	getDb.mockResolvedValue({
		collection: () => ({
			findOne,
			insertOne,
			find: () => ({
				sort: () => ({ limit: () => ({ toArray: async () => [] }) }),
				toArray: async () => []
			})
		})
	});
	const data = (await load({
		locals: { user: { email: 'editor@example.com' } },
		url: new URL(`https://admin.missionnaire.net/publications?edit=${archived.id}`),
		fetch: archiveFetch
	} as any)) as any;
	expect(data.edit).toMatchObject({
		id: archived.id,
		imageUrl: archived.image,
		body: archived.text
	});

	await expect(
		actions.save!({
			...event({
				postId: archived.id,
				sourceTitle: archived.sourceTitle,
				body: archived.text,
				publishedAt: '2026-10-01T22:20',
				imageUrl: archived.image,
				imageWidth: '1200',
				imageHeight: '675',
				intent: 'publish'
			}),
			fetch: archiveFetch
		} as any)
	).rejects.toMatchObject({
		status: 303,
		location: `/publications?edit=${archived.id}&saved=published`
	});
	expect(insertOne).toHaveBeenCalledWith(
		expect.objectContaining({
			_id: archived.id,
			image: archived.image,
			bodyHtml: archived.bodyHtml,
			links: archived.links,
			createdBy: null,
			updatedBy: 'editor@example.com'
		})
	);
});

it('rejects a substituted image when editing an earlier post', async () => {
	findOne.mockResolvedValue(null);
	const result = await actions.save!({
		...event({
			postId: archived.id,
			sourceTitle: archived.sourceTitle,
			body: archived.text,
			publishedAt: '2026-10-01T22:20',
			imageUrl: '/img/extraits/another.jpg',
			intent: 'publish'
		}),
		fetch: archiveFetch
	} as any);
	expect(result).toMatchObject({ status: 400 });
	expect(insertOne).not.toHaveBeenCalled();
});
