import { error } from '@sveltejs/kit';
import { getPublishedById, getTranscriptForYoutubeVideoId } from '$lib/server/recordings';
import type { PageServerLoad } from './$types';

const ALLOWED_BACK_PARAMS = new Set(['page', 'q', 'year', 'month']);

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
	const transcript = await getTranscriptForYoutubeVideoId(recording.source_video_id);
	return { recording, backHref, transcript };
};
