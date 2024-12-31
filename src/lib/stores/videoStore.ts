import type { YoutubeVideo } from '@mnlib/lib/models/youtube';
import { derived, writable } from 'svelte/store';

export const searchTerm = writable<string>('');
export const videoList = writable<YoutubeVideo[]>();
export const filteredVideoList = derived(
	[searchTerm, videoList],
	([$term, $videoList]) => {
		if ($term.trim() === '') {
			return $videoList;
		} else {
			return $videoList.filter((video) => video.title.toLowerCase().includes($term.toLowerCase()));
		}
	},
	[]
);
