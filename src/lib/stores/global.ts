import { writable } from 'svelte/store';
import type { AudioAsset } from '$lib/models/media-assets';
import type { MusicAudio } from '$lib/models/music-audio';
import type { YoutubeVideo } from '$lib/models/youtube';
import type { Sermon } from '$lib/models/sermon';

// Create a writable store to hold the selectAudio value

export const selectAudio = writable<AudioAsset | MusicAudio | Sermon | null>(null);
export const playlist = writable<(AudioAsset | MusicAudio | Sermon)[]>([]);
export const basePlaylist = writable<(AudioAsset | MusicAudio | Sermon)[]>([]);
export const currentIndex = writable<number>(0);
export const autoNext = writable<boolean>(true);
export const isShuffle = writable<boolean>(false);
export const isPlaying = writable<boolean>(false);
export const isLoading = writable<boolean>(false);
export const searchQuery = writable<string>('');
export const currentViewingVideo = writable<YoutubeVideo>();
export const filteredVideos = writable<YoutubeVideo[]>();

// Video Playlist Search
export const videoPlaylist = writable<YoutubeVideo[]>([]);
export const videoPlaylistIndex = writable<number>(0);
export const isVideoPlaylistActive = writable<boolean>(false);
export const isVideoShuffle = writable<boolean>(false);
export const videoPlaylistSearch = writable<string>('');
export const videoPlaylistTotal = writable<number>(0);
