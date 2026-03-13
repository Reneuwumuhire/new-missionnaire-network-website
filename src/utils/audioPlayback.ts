import type { AudioAsset } from '$lib/models/media-assets';
import type { MusicAudio } from '$lib/models/music-audio';
import type { Sermon } from '$lib/models/sermon';

export type PlayableAudio = AudioAsset | MusicAudio | Sermon;
export type SermonPlaybackLanguage = 'french' | 'english';

export function getPlayableAudioUrl(item: PlayableAudio | null | undefined): string {
	if (!item) return '';

	if ('s3_url' in item) {
		return item.s3_url || '';
	}

	if ('mp3_url' in item) {
		return item.mp3_url || '';
	}

	if ('url' in item) {
		return item.url || '';
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
