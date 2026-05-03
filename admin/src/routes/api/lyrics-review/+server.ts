import { json, type RequestEvent } from '@sveltejs/kit';
import { canReviewLyrics } from '$lib/models/admin-user';
import {
	loadLyricsReviewRows,
	saveLyricsReview,
	saveLyricsReviewBulk
} from '$lib/server/lyricsReview';

export async function GET(event: RequestEvent) {
	if (!canReviewLyrics(event.locals.user)) {
		return json({ error: 'Accès refusé' }, { status: 403 });
	}

	try {
		const result = await loadLyricsReviewRows();
		return json(result);
	} catch (error) {
		console.error('[LyricsReview] Load error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Could not load lyrics review data' },
			{ status: 500 }
		);
	}
}

export async function POST(event: RequestEvent) {
	if (!canReviewLyrics(event.locals.user)) {
		return json({ error: 'Accès refusé' }, { status: 403 });
	}

	try {
		const body = await event.request.json();
		if (Array.isArray(body.audioIds)) {
			const result = await saveLyricsReviewBulk({
				audioIds: body.audioIds.map((id: unknown) => String(id ?? '')),
				reviewNotes: body.reviewNotes === undefined ? undefined : String(body.reviewNotes ?? ''),
				reviewStatus: body.reviewStatus ?? '',
				reviewedBy: String(body.reviewedBy ?? '')
			});

			return json(result);
		}

		const result = await saveLyricsReview({
			audioId: String(body.audioId ?? ''),
			reviewNotes: String(body.reviewNotes ?? ''),
			reviewStatus: body.reviewStatus ?? '',
			reviewedBy: String(body.reviewedBy ?? '')
		});

		return json(result);
	} catch (error) {
		console.error('[LyricsReview] Save error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Could not save lyrics review' },
			{ status: 400 }
		);
	}
}
