import { type RequestEvent } from '@sveltejs/kit';
import { canReviewLyrics } from '$lib/models/admin-user';
import { exportLyricsReviewCsv } from '$lib/server/lyricsReview';

export async function GET(event: RequestEvent) {
	if (!canReviewLyrics(event.locals.user)) {
		return new Response('Accès refusé', { status: 403 });
	}

	try {
		const csv = await exportLyricsReviewCsv();
		return new Response(csv, {
			headers: {
				'content-disposition': 'attachment; filename="lyrics-matches-reviewed.csv"',
				'content-type': 'text/csv; charset=utf-8'
			}
		});
	} catch (error) {
		console.error('[LyricsReview] Export error:', error);
		return new Response(
			error instanceof Error ? error.message : 'Could not export lyrics review CSV',
			{
				status: 500
			}
		);
	}
}
