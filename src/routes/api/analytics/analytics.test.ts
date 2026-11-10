import { expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	updateOne: vi.fn(async (..._args: unknown[]) => ({})),
	insertOne: vi.fn(async (..._args: unknown[]) => ({})),
	createIndex: vi.fn(async (..._args: unknown[]) => 'occurredAt_1')
}));
vi.mock('../../../db/mongo', () => ({
	getDb: async () => ({
		collection: () => ({
			updateOne: mocks.updateOne,
			insertOne: mocks.insertOne,
			createIndex: mocks.createIndex
		})
	})
}));
vi.mock('$lib/server/analytics', () => ({ getAnalyticsStats: vi.fn() }));
vi.mock('$app/environment', () => ({ dev: false }));

import { POST } from './+server';

function event(body: unknown) {
	const url = new URL('https://missionnaire.net/api/analytics');
	const request = new Request(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'sec-fetch-site': 'same-origin',
			'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'
		},
		body: JSON.stringify(body)
	});
	const cookies = {
		get: () => 'existing-visitor-id-1234567890',
		set: vi.fn()
	};
	return { request, url, cookies } as never;
}

beforeEach(() => {
	mocks.updateOne.mockClear();
	mocks.insertOne.mockClear();
});

it('records a sustained playback as one visitor-item-day and leaves page views untouched', async () => {
	const response = await POST(
		event({ event: 'playback', kind: 'sermon', id: '63-0317M', title: 'The First Seal' })
	);
	expect(response.status).toBe(204);
	expect(mocks.updateOne).toHaveBeenCalledOnce();
	const filter = mocks.updateOne.mock.calls[0][0] as { _id: string };
	const update = mocks.updateOne.mock.calls[0][1] as { $setOnInsert: Record<string, unknown> };
	expect(filter._id).toMatch(/:\w+:63-0317M:existing-visitor-id-1234567890$/);
	expect(update.$setOnInsert).toMatchObject({
		kind: 'sermon',
		itemId: '63-0317M',
		title: 'The First Seal'
	});
	expect(mocks.updateOne.mock.calls[0][2]).toEqual({ upsert: true });
	expect(mocks.insertOne).toHaveBeenCalledOnce();
	expect(mocks.insertOne.mock.calls[0][0]).toMatchObject({
		visitorId: 'existing-visitor-id-1234567890',
		kind: 'sermon',
		itemId: '63-0317M'
	});
});

it('rejects an invalid playback kind before writing', async () => {
	const response = await POST(event({ event: 'playback', kind: 'other', id: 'x', title: 'X' }));
	expect(response.status).toBe(400);
	expect(mocks.updateOne).not.toHaveBeenCalled();
	expect(mocks.insertOne).not.toHaveBeenCalled();
});

it('records each confirmed page visit for the five-minute view', async () => {
	const response = await POST(event({ path: '/musique' }));
	expect(response.status).toBe(204);
	expect(mocks.insertOne).toHaveBeenCalledOnce();
	expect(mocks.insertOne.mock.calls[0][0]).toMatchObject({
		visitorId: 'existing-visitor-id-1234567890',
		path: '/musique'
	});
});
