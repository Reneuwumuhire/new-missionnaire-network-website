// Mirrors admin/src/lib/server/video-sync.ts:extractYoutubeVideoId. Kept
// inline here because the recorder ships as an independent service (Fly.io)
// with its own dependency tree and can't import from the SvelteKit app.

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function extractYoutubeVideoId(input: string | null | undefined): string | null {
	if (!input) return null;
	const trimmed = input.trim();
	if (!trimmed) return null;
	if (YOUTUBE_ID_RE.test(trimmed)) return trimmed;

	try {
		const url = new URL(trimmed);
		const host = url.hostname.replace(/^www\./, '');
		if (host === 'youtu.be') {
			const id = url.pathname.slice(1).split('/')[0];
			return YOUTUBE_ID_RE.test(id) ? id : null;
		}
		if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
			const watchId = url.searchParams.get('v');
			if (watchId && YOUTUBE_ID_RE.test(watchId)) return watchId;
			const pathMatch = url.pathname.match(/^\/(?:live|shorts|embed|v)\/([A-Za-z0-9_-]{11})/);
			return pathMatch ? pathMatch[1] : null;
		}
	} catch {
		return null;
	}

	return null;
}
