import { json, type RequestEvent } from '@sveltejs/kit';
import { loadLyricsReviewRows, saveLyricsReview } from '$lib/server/lyricsReview';

export async function GET(event: RequestEvent) {
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
	try {
		const body = await event.request.json();
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
