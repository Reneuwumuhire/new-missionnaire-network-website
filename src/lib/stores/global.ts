import { setContext } from 'svelte';
import { writable } from 'svelte/store';
import type { VideoItem } from '../../core/model/youtube';

// Create a writable store to hold the selectAudio value

export const selectAudio = writable<VideoItem | null>(null);
