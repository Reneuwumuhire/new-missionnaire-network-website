import type { AudioAsset } from '$lib/models/media-assets';
import type { MusicAudio } from '$lib/models/music-audio';
import type { Sermon } from '$lib/models/sermon';

export type PlayableAudio = AudioAsset | MusicAudio | Sermon;
export type SermonPlaybackLanguage = 'french' | 'english';

// Some s3_url values stored in MongoDB contain literal spaces or `+`
// characters in the key. Browsers usually tolerate this, but S3 rejects
// requests where reserved chars in the path aren't percent-encoded — which
// is why a handful of songs (e.g. Umuco/20 MFISE UMUKIZA ANKUNDA+++.mp3)
// silently fail to play. Re-encode the path before handing it to an
// <audio> element. The decode-then-encode round-trip is idempotent for
// already-encoded URLs.
export function encodeUrlPath(rawUrl: string): string {
	try {
		const url = new URL(rawUrl);
		url.pathname = url.pathname
			.split('/')
			.map((segment) => (segment === '' ? '' : encodeURIComponent(decodeURIComponent(segment))))
			.join('/');
		return url.toString();
	} catch {
		return rawUrl;
	}
}

export function getPlayableAudioUrl(item: PlayableAudio | null | undefined): string {
	if (!item) return '';

	if ('s3_url' in item) {
		return item.s3_url ? encodeUrlPath(item.s3_url) : '';
	}

	if ('mp3_url' in item) {
		return item.mp3_url ? encodeUrlPath(item.mp3_url) : '';
	}

	if ('url' in item) {
		return item.url ? encodeUrlPath(item.url) : '';
	}

	return '';
}

export function createPlayableSermon(
	sermon: Sermon,
	language: SermonPlaybackLanguage = 'french'
): Sermon {
	if (language !== 'english') {
		return sermon;
	}

	return {
		...sermon,
		mp3_url: sermon.english_audio_url ?? null,
		french_title: sermon.english_title || sermon.french_title
	};
}

export function findAdjacentPlayableIndex(
	list: PlayableAudio[],
	startIndex: number,
	direction: 1 | -1,
	wrap = false
): number {
	if (list.length === 0) return -1;

	let index = startIndex;
	let attempts = 0;

	while (attempts < list.length) {
		index += direction;

		if (index < 0 || index >= list.length) {
			if (!wrap) return -1;
			index = direction === 1 ? 0 : list.length - 1;
		}

		if (getPlayableAudioUrl(list[index])) {
			return index;
		}

		attempts += 1;
	}

	return -1;
}
