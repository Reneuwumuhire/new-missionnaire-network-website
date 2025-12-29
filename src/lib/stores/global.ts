import { writable } from 'svelte/store';
import type { AudioAsset } from '$lib/models/media-assets';
import type { MusicAudio } from '$lib/models/music-audio';
import type { YoutubeVideo } from '$lib/models/youtube';

// Create a writable store to hold the selectAudio value

export const selectAudio = writable<AudioAsset | MusicAudio | null>(null);
export const playlist = writable<(AudioAsset | MusicAudio)[]>([]);
export const basePlaylist = writable<(AudioAsset | MusicAudio)[]>([]);
export const currentIndex = writable<number>(0);
export const autoNext = writable<boolean>(true);
export const isShuffle = writable<boolean>(false);
export const isLoading = writable<boolean>(false);
export const searchQuery = writable<string>('');
export const currentViewingVideo = writable<YoutubeVideo>();
export const filteredVideos = writable<YoutubeVideo[]>();
