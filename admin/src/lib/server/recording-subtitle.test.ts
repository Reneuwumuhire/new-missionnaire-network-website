import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recording } from '$lib/models/recording';
import { getDb } from '../../db/mongo';
import { resolveRecordingSubtitle } from './recording-subtitle';

vi.mock('../../db/mongo', () => ({ getDb: vi.fn() }));

const recording = {
	_id: 'recording-1',
	started_at: new Date('2026-10-11T08:04:13.568Z'),
	subtitle_srt_s3_key: null,
	subtitle_filename: null,
	subtitle_offset_into_recording_ms: null
} as unknown as Recording;

describe('recording subtitle source', () => {
	beforeEach(() => vi.resetAllMocks());

	it('shows the scheduled live SRT when the recording has no separate SRT', async () => {
		const findOne = vi.fn().mockResolvedValue({
			_id: 'live-1',
			subtitle_srt_s3_key: 'subtitles/sermon.srt',
			subtitle_filename: 'sermon.srt',
			subtitle_anchor_epoch_ms: new Date('2026-10-11T08:05:13.568Z').getTime(),
			subtitle_offset_ms: -10000
		});
		vi.mocked(getDb).mockResolvedValue({ collection: () => ({ findOne }) } as never);

		await expect(resolveRecordingSubtitle(recording)).resolves.toEqual({
			source: 'scheduled',
			key: 'subtitles/sermon.srt',
			filename: 'sermon.srt',
			scheduledLiveId: 'live-1',
			syncReady: true,
			offsetIntoRecordingMs: 50000
		});
		expect(findOne).toHaveBeenCalledWith(
			{ recording_id: 'recording-1' },
			expect.objectContaining({ projection: expect.objectContaining({ subtitle_srt_s3_key: 1 }) })
		);
	});

	it('prefers a recording SRT and identifies an unsynced file', async () => {
		await expect(
			resolveRecordingSubtitle({
				...recording,
				subtitle_srt_s3_key: 'subtitles/replay.srt',
				subtitle_filename: 'replay.srt'
			})
		).resolves.toEqual({
			source: 'recording',
			key: 'subtitles/replay.srt',
			filename: 'replay.srt',
			scheduledLiveId: null,
			syncReady: false,
			offsetIntoRecordingMs: null
		});
		expect(getDb).not.toHaveBeenCalled();
	});
});
