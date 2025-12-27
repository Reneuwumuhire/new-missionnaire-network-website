import { writable } from 'svelte/store';
import type { AudioAsset } from '$lib/models/media-assets';
import type { YoutubeVideo } from '$lib/models/youtube';

// Create a writable store to hold the selectAudio value

export const selectAudio = writable<AudioAsset | null>(null);
export const isLoading = writable<Boolean>(false);
export const searchQuery = writable<String>('');
export const currentViewingVideo = writable<YoutubeVideo>();
export const filteredVideos = writable<YoutubeVideo[]>();
