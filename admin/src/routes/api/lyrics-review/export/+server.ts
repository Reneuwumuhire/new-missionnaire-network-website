import { type RequestEvent } from '@sveltejs/kit';
import { exportLyricsReviewCsv } from '$lib/server/lyricsReview';

export async function GET(event: RequestEvent) {
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
