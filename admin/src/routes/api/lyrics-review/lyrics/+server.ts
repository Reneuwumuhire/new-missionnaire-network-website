import { json, type RequestEvent } from '@sveltejs/kit';
import { extractLyricsFromUrl } from '$lib/server/lyricsReview';

export async function GET(event: RequestEvent) {
	const sourceUrl = event.url.searchParams.get('url');
	if (!sourceUrl) {
		return json({ error: 'url is required' }, { status: 400 });
	}

	try {
		return json(await extractLyricsFromUrl(sourceUrl));
	} catch (error) {
		console.error('[LyricsReview] Lyrics fetch error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Could not load lyrics' },
			{ status: 400 }
		);
	}
}
