import type { YoutubeVideo } from '$lib/models/youtube';
import { derived, writable } from 'svelte/store';

export const searchTerm = writable<string>('');
export const videoList = writable<YoutubeVideo[]>();
export const activeFilter = writable<string>('All');
export const isLoading = writable<boolean>(false);
export const isInitialLoading = writable<boolean>(true);
export const skip = writable(0);
export const videos = writable<any[]>([]);
export const liveVideo = writable<YoutubeVideo | undefined>(undefined);
export const selectedVideo = writable<YoutubeVideo | undefined>(undefined);
export const hasMore = writable(true);
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
