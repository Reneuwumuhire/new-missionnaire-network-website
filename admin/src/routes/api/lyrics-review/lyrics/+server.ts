import { json, type RequestEvent } from '@sveltejs/kit';
import { canReviewLyrics } from '$lib/models/admin-user';
import { extractLyricsFromUrl } from '$lib/server/lyricsReview';

export async function GET(event: RequestEvent) {
	if (!canReviewLyrics(event.locals.user)) {
		return json({ error: 'Accès refusé' }, { status: 403 });
	}

	const sourceUrl = event.url.searchParams.get('url');
	if (!sourceUrl) {
		return json({ error: 'url is required' }, { status: 400 });
	}
	const versionLabel = event.url.searchParams.get('version') ?? '';
	const audioTitle = event.url.searchParams.get('audioTitle') ?? '';

	try {
		return json(await extractLyricsFromUrl(sourceUrl, { audioTitle, versionLabel }));
	} catch (error) {
		console.error('[LyricsReview] Lyrics fetch error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Could not load lyrics' },
			{ status: 400 }
		);
	}
}
