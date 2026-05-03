import { json, type RequestEvent } from '@sveltejs/kit';
import { canReviewLyrics } from '$lib/models/admin-user';
import {
	clearLyricsTimeline,
	getLyricsTimelineDetail,
	resetLyricsLineBreaks,
	saveLyricsTimeline,
	splitLyricsLine,
	syncLyricsForAudioId
} from '$lib/server/lyricsTimeline';

export async function GET(event: RequestEvent) {
	if (!canReviewLyrics(event.locals.user)) {
		return json({ error: 'Accès refusé' }, { status: 403 });
	}

	try {
		return json(await getLyricsTimelineDetail(event.params.audioId ?? ''));
	} catch (error) {
		console.error('[LyricsTimeline] Load error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Could not load lyrics timeline' },
			{ status: 400 }
		);
	}
}

export async function POST(event: RequestEvent) {
	if (!canReviewLyrics(event.locals.user)) {
		return json({ error: 'Accès refusé' }, { status: 403 });
	}

	try {
		const body = await event.request.json();
		const action = String(body.action ?? '');
		const audioId = event.params.audioId ?? '';
		const actor = event.locals.user?.email ?? '';

		if (action === 'sync') {
			const result = await syncLyricsForAudioId(audioId, actor);
			const detail = await getLyricsTimelineDetail(audioId);
			return json({ ...detail, sync: result });
		}

		if (action === 'save_timeline') {
			return json(
				await saveLyricsTimeline({
					audioId,
					status: body.status === 'published' ? 'published' : 'draft',
					timings: Array.isArray(body.timings) ? body.timings : [],
					updatedBy: actor
				})
			);
		}

		if (action === 'split_line') {
			return json(
				await splitLyricsLine({
					audioId,
					lineId: String(body.lineId ?? ''),
					parts: Array.isArray(body.parts)
						? body.parts.map((part: unknown) => String(part ?? ''))
						: [],
					updatedBy: actor
				})
			);
		}

		if (action === 'reset_line_breaks') {
			return json(await resetLyricsLineBreaks({ audioId, updatedBy: actor }));
		}

		if (action === 'clear_timeline') {
			return json(await clearLyricsTimeline({ audioId, updatedBy: actor }));
		}

		return json({ error: 'Unsupported action' }, { status: 400 });
	} catch (error) {
		console.error('[LyricsTimeline] Save error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Could not save lyrics timeline' },
			{ status: 400 }
		);
	}
}
