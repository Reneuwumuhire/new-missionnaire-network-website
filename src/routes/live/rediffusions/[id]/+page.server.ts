import { error } from '@sveltejs/kit';
import { getPublishedById, getTranscriptForRecording } from '$lib/server/recordings';
import { getScheduledLiveByRecordingId } from '../../../../db/collections';
import type { PageServerLoad } from './$types';

const ALLOWED_BACK_PARAMS = new Set(['page', 'q', 'year', 'month', 'type']);

// Rebuild a safe back-URL from the `from` query string. We only whitelist
// the params the list page actually uses, so someone can't craft a link
// like `?from=foo=bar` to inject arbitrary state.
function sanitizeFrom(from: string | null): string {
	if (!from) return '/live/rediffusions';
	try {
		const parsed = new URLSearchParams(from);
		const clean = new URLSearchParams();
		for (const [key, value] of parsed) {
			if (ALLOWED_BACK_PARAMS.has(key) && value) clean.set(key, value);
		}
		const qs = clean.toString();
		return qs ? `/live/rediffusions?${qs}` : '/live/rediffusions';
	} catch {
		return '/live/rediffusions';
	}
}

export const load: PageServerLoad = async ({ params, url }) => {
	const recording = await getPublishedById(params.id);
	if (!recording) throw error(404, 'Enregistrement introuvable');
	const backHref = sanitizeFrom(url.searchParams.get('from'));
	const transcript = await getTranscriptForRecording({
		transcript_pdf_id: recording.transcript_pdf_id,
		source_video_id: recording.source_video_id,
		started_at: recording.started_at
	});

	// Synced SRT transcript: if this recording's broadcast had subtitles AND
	// the admin anchored them during the live, translate that wall-clock anchor
	// into an offset from the recording start. The recorder captures the same
	// Icecast output listeners heard, so recording position t was on air at
	// started_at + t — hence SRT 00:00 sits at (anchor + offset − started_at)
	// into the file.
	let subtitles: { url: string; offsetIntoRecordingMs: number } | null = null;
	const scheduled = await getScheduledLiveByRecordingId(recording.id);
	if (
		scheduled?.subtitle_srt_s3_key &&
		typeof scheduled.subtitle_anchor_epoch_ms === 'number' &&
		recording.started_at
	) {
		const startedMs = Date.parse(recording.started_at);
		if (Number.isFinite(startedMs)) {
			subtitles = {
				url: `/api/subtitles/file?key=${encodeURIComponent(scheduled.subtitle_srt_s3_key)}`,
				offsetIntoRecordingMs:
					scheduled.subtitle_anchor_epoch_ms + (scheduled.subtitle_offset_ms ?? 0) - startedMs
			};
		}
	}

	return { recording, backHref, transcript, subtitles };
};
