const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Accept the ordinary YouTube links operators copy from a live page. */
export function youtubeVideoId(value: string): string | null {
	let url: URL;
	try {
		url = new URL(value.trim());
	} catch {
		return null;
	}
	if (url.protocol !== 'https:') return null;
	const host = url.hostname.toLowerCase().replace(/^www\./, '');
	let candidate: string | null = null;
	if (host === 'youtu.be') candidate = url.pathname.split('/').filter(Boolean)[0] ?? null;
	if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
		candidate = url.searchParams.get('v');
		if (!candidate) {
			const [kind, id] = url.pathname.split('/').filter(Boolean);
			if (kind === 'live' || kind === 'embed' || kind === 'shorts') candidate = id ?? null;
		}
	}
	return candidate && VIDEO_ID.test(candidate) ? candidate : null;
}

export const youtubeWatchUrl = (videoId: string) =>
	`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

export const youtubeChatUrl = (videoId: string) =>
	`https://www.youtube.com/live_chat?v=${encodeURIComponent(videoId)}&is_popout=1`;
