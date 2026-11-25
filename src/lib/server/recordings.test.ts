import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const cursor = {
		hint: vi.fn(),
		project: vi.fn(),
		sort: vi.fn(),
		skip: vi.fn(),
		limit: vi.fn(),
		toArray: vi.fn<() => Promise<Array<{ _id: string }>>>(async () => [])
	};
	for (const method of ['hint', 'project', 'sort', 'skip', 'limit'] as const) {
		cursor[method].mockReturnValue(cursor);
	}
	return {
		cursor,
		createIndexes: vi.fn(async () => []),
		countDocuments: vi.fn(async () => 0),
		find: vi.fn(() => cursor),
		findOne: vi.fn<() => Promise<Record<string, unknown> | null>>(async () => ({
			_id: { toString: () => '6abd477a1473609269a4fcb7' },
			title: 'Retransmission',
			started_at: new Date('2026-09-30T17:30:00Z'),
			s3_url: 'https://cdn.example.com/original.mp3',
			french_audio_s3_url: 'https://cdn.example.com/french.mp3',
			french_audio_size_bytes: 1024,
			french_audio_duration_sec: 3600,
			original_audio_language: 'rw'
		}))
	};
});

vi.mock('../../db/mongo', () => ({
	getDb: async () => ({
		collection: () => ({
			createIndexes: mocks.createIndexes,
			countDocuments: mocks.countDocuments,
			find: mocks.find,
			findOne: mocks.findOne
		})
	})
}));

import {
	getPublishedById,
	getReplayIdForTranscript,
	getRetransmissionYears,
	listRetransmissions
} from './recordings';

it('prefers the transcript’s original published recording', async () => {
	const pdf = '6b02f6a653ce4dc8b618dfd9';
	const replay = '6abd477a1473609269a4fcb7';
	mocks.findOne.mockResolvedValueOnce({ _id: replay });
	await expect(getReplayIdForTranscript(pdf, replay, 'video-id')).resolves.toBe(replay);
	expect(mocks.findOne).toHaveBeenLastCalledWith(
		{
			_id: expect.objectContaining({ toHexString: expect.any(Function) }),
			published: true,
			status: 'ready',
			transcript_pdf_id: { $in: [pdf, null] }
		},
		{ projection: { _id: 1 } }
	);
});

it('uses the shared video only when it points to one eligible replay', async () => {
	const replay = { _id: '6abd477a1473609269a4fcb7' };
	const pdf = '6b02f6a653ce4dc8b618dfd9';
	mocks.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
	mocks.cursor.toArray
		.mockResolvedValueOnce([replay])
		.mockResolvedValueOnce([replay, { _id: '6abd477a1473609269a4fcb8' }]);

	await expect(getReplayIdForTranscript(pdf, null, 'video-id')).resolves.toBe(replay._id);
	await expect(getReplayIdForTranscript(pdf, null, 'video-id')).resolves.toBeNull();
	expect(mocks.find).toHaveBeenLastCalledWith(
		{ published: true, status: 'ready', source_video_id: 'video-id', transcript_pdf_id: null },
		{ projection: { _id: 1 } }
	);
	expect(mocks.cursor.limit).toHaveBeenLastCalledWith(2);
});

it('includes the French audio on a recording detail page', async () => {
	await expect(getPublishedById('6abd477a1473609269a4fcb7')).resolves.toMatchObject({
		french_audio_url: 'https://cdn.example.com/french.mp3',
		french_audio_size_bytes: 1024,
		french_audio_duration_sec: 3600,
		original_audio_language: 'rw'
	});
	expect(mocks.findOne).toHaveBeenCalledWith(
		expect.anything(),
		expect.objectContaining({
			projection: expect.objectContaining({
				french_audio_s3_url: 1,
				french_audio_size_bytes: 1,
				french_audio_duration_sec: 1,
				original_audio_language: 1
			})
		})
	);
});

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
