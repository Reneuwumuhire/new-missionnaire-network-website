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
export const repeatOne = writable<boolean>(false);
export const isPlaying = writable<boolean>(false);
// User's expressed intent to play, decoupled from `isPlaying` (which flips
// to false on every OS-initiated pause: phone calls, Siri, audio focus
// grabs). The resume recorder reads this when deciding whether to
// rehydrate the player on a cold reload — if the user was actively
// listening when iOS killed the PWA, we restore; if they had paused,
// we leave the page clean.
export const playbackIntent = writable<boolean>(false);
export const isLoading = writable<boolean>(false);
export const searchQuery = writable<string>('');
export const currentViewingVideo = writable<YoutubeVideo>();
export const filteredVideos = writable<YoutubeVideo[]>();

// Radio live status — shared across components (banner, homepage, radio player)
export const radioIsLive = writable<boolean>(false);

// Live player playback position bridge — written by +liveRadioPlayer, read by
// the live transcript. positionEpochMs = wall-clock ms of the audio the
// listener is hearing right now (stream connection epoch + playback
// position); null when no stream is connected. Pause freezes it, DVR
// rewind shifts it back, reconnects snap it to "now".
export const livePlayback = writable<{ playing: boolean; positionEpochMs: number | null }>({
	playing: false,
	positionEpochMs: null
});

// Global audio player position bridge — written by +audioPlayer (throttled),
// read by the replay transcript on the rediffusion page. trackId is the
// playing item's _id so the transcript only follows its own recording.
export const replayPlayback = writable<{
	trackId: string | null;
	timeSec: number;
	playing: boolean;
}>({ trackId: null, timeSec: 0, playing: false });

// Video Playlist Search
export const videoPlaylist = writable<YoutubeVideo[]>([]);
export const videoPlaylistIndex = writable<number>(0);
export const isVideoPlaylistActive = writable<boolean>(false);
export const isVideoShuffle = writable<boolean>(false);
export const videoPlaylistSearch = writable<string>('');
export const videoPlaylistTotal = writable<number>(0);
