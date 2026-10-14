import type { Recording } from '$lib/models/recording';
import { getDb } from '../../db/mongo';

export type RecordingSubtitle = {
	source: 'recording' | 'scheduled';
	key: string;
	filename: string;
	scheduledLiveId: string | null;
	syncReady: boolean;
	offsetIntoRecordingMs: number | null;
};

/** Resolve the subtitle source shown by the replay editor. A recording's own
 * SRT takes precedence; otherwise the replay inherits its linked live's SRT. */
export async function resolveRecordingSubtitle(
	recording: Recording
): Promise<RecordingSubtitle | null> {
	if (recording.subtitle_srt_s3_key?.startsWith('subtitles/')) {
		const offset = recording.subtitle_offset_into_recording_ms;
		return {
			source: 'recording',
			key: recording.subtitle_srt_s3_key,
			filename: recording.subtitle_filename || 'transcription.srt',
			scheduledLiveId: null,
			syncReady: typeof offset === 'number',
			offsetIntoRecordingMs: typeof offset === 'number' ? offset : null
		};
	}
	if (!recording._id) return null;
	const db = await getDb();
	const live = await db.collection('scheduled_lives').findOne(
		{ recording_id: recording._id },
		{
			projection: {
				_id: 1,
				subtitle_srt_s3_key: 1,
				subtitle_filename: 1,
				subtitle_anchor_epoch_ms: 1,
				subtitle_offset_ms: 1
			}
		}
	);
	if (!live?.subtitle_srt_s3_key?.startsWith('subtitles/')) return null;
	const started = new Date(recording.started_at).getTime();
	const offset =
		typeof live.subtitle_anchor_epoch_ms === 'number' && Number.isFinite(started)
			? live.subtitle_anchor_epoch_ms + (live.subtitle_offset_ms ?? 0) - started
			: null;
	return {
		source: 'scheduled',
		key: live.subtitle_srt_s3_key,
		filename: live.subtitle_filename || 'transcription.srt',
		scheduledLiveId: String(live._id),
		syncReady: offset !== null,
		offsetIntoRecordingMs: offset
	};
}
