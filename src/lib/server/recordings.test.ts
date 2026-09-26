import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const cursor = {
		hint: vi.fn(),
		project: vi.fn(),
		sort: vi.fn(),
		skip: vi.fn(),
		limit: vi.fn(),
		toArray: vi.fn(async () => [])
	};
	for (const method of ['hint', 'project', 'sort', 'skip', 'limit'] as const) {
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

import { getRetransmissionYears, listRetransmissions } from './recordings';

it('uses a covered recording list index and a safe sort', async () => {
	await listRetransmissions({ sortField: 'library_search' });

	expect(mocks.createIndexes).toHaveBeenCalledWith([
		{
			key: {
				published: 1,
				status: 1,
				started_at: -1,
				title: 1,
				duration_sec: 1,
				s3_url: 1,
				size_bytes: 1,
				thumbnail_url: 1,
				_id: 1
			},
			name: 'published_recording_list_by_date_v2'
		},
		{
			key: {
				published: 1,
				status: 1,
				title: 1,
				started_at: 1,
				duration_sec: 1,
				s3_url: 1,
				size_bytes: 1,
				thumbnail_url: 1,
				_id: 1
			},
			name: 'published_recording_list_by_title_v2'
		},
		{
			key: {
				published: 1,
				status: 1,
				duration_sec: 1,
				title: 1,
				started_at: 1,
				s3_url: 1,
				size_bytes: 1,
				thumbnail_url: 1,
				_id: 1
			},
			name: 'published_recording_list_by_duration_v2'
		}
	]);
	expect(mocks.cursor.project).toHaveBeenCalledWith({
		_id: 1,
		title: 1,
		started_at: 1,
		duration_sec: 1,
		s3_url: 1,
		size_bytes: 1,
		thumbnail_url: 1
	});
	expect(mocks.cursor.hint).toHaveBeenCalledWith('published_recording_list_by_date_v2');
	expect(mocks.cursor.sort).toHaveBeenCalledWith({ started_at: -1 });
});

it('offers only years containing retransmissions', async () => {
	mocks.cursor.toArray.mockResolvedValueOnce([
		{ started_at: new Date('2025-01-01T00:00:00Z') },
		{ started_at: new Date('2026-01-01T00:00:00Z') },
		{ started_at: new Date('2025-06-01T00:00:00Z') }
	] as never[]);

	await expect(getRetransmissionYears()).resolves.toEqual([2026, 2025]);
	expect(mocks.find).toHaveBeenLastCalledWith(
		{
			published: true,
			status: 'ready',
			title: { $regex: 'retransmission|frank|ewald', $options: 'i' }
		},
		{ projection: { started_at: 1 } }
	);
});

it('surfaces database failures instead of reporting an empty library', async () => {
	mocks.find.mockImplementationOnce(() => {
		throw new Error('database timeout');
	});

	await expect(listRetransmissions()).rejects.toThrow('database timeout');
});
