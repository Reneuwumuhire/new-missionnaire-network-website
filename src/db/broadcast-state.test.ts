import { expect, it, vi } from 'vitest';
import { setBroadcastAdminState as writeStudio } from './collections';

// Exercise both real writers without connecting to MongoDB.
const { updateOne } = vi.hoisted(() => ({ updateOne: vi.fn() }));
vi.mock('./mongo', () => ({
	getDb: async () => ({ collection: () => ({ updateOne }) })
}));
vi.mock('../../admin/src/db/mongo', () => ({
	getDb: async () => ({ collection: () => ({ updateOne }) })
}));

// Admin has its own $lib type aliases; load its writer through Vitest so the
// main app's type checker doesn't resolve admin models against the public app.
const { setBroadcastAdminState: writeAdmin } = await vi.importActual<{
	setBroadcastAdminState: typeof writeStudio;
}>('../../admin/src/db/collections');

it('prevents an old Studio timeline from overriding subsequent broadcast and subtitle controls', async () => {
	const oldTimeline = [
		{
			fromEpochMs: 1000,
			toEpochMs: null,
			url: 'https://example.com/old.srt',
			anchorEpochMs: 1000,
			offsetMs: 0,
			pausedPositionMs: null
		}
	];
	for (const write of [writeAdmin, writeStudio]) {
		for (const change of [
			{ is_live: true, scheduled_live_id: 'evening-broadcast' },
			{
				subtitle_srt_url: 'https://example.com/current.srt',
				subtitle_srt_s3_key: 'subtitles/current.srt',
				subtitle_anchor_epoch_ms: null
			},
			{ subtitle_anchor_epoch_ms: 20_000 }, // start, jump-to-cue or recording auto-sync
			{ subtitle_offset_ms: 5000 }, // nudge / set-offset
			{ subtitle_anchor_epoch_ms: null }, // hide / clear
			{ is_live: false } // manual end or automatic offline safety
		]) {
			let stored = {
				is_live: true,
				subtitle_timeline: oldTimeline,
				subtitle_srt_url: 'https://example.com/current.srt'
			};
			updateOne.mockImplementation(async (_filter, { $set }) => {
				stored = { ...stored, ...$set };
			});
			await write(change);
			expect(stored.subtitle_timeline).toEqual([]);
			expect(stored).toMatchObject(change);
			expect(stored.subtitle_srt_url).toBe('https://example.com/current.srt');
			if (!('is_live' in change)) expect(stored.is_live).toBe(true);
		}

		await write({
			title: 'Corrected title',
			notification_pending: false,
			icecast_offline_since: null
		});
		expect(updateOne.mock.lastCall?.[1].$set).not.toHaveProperty('subtitle_timeline');
	}

	// Studio owns its timeline when syncing or closing a sermon segment.
	for (const timeline of [oldTimeline, [{ ...oldTimeline[0], toEpochMs: 30_000 }], []]) {
		await writeStudio({ subtitle_anchor_epoch_ms: null, subtitle_timeline: timeline });
		expect(updateOne.mock.lastCall?.[1].$set.subtitle_timeline).toEqual(timeline);
	}
});
