import { writable } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Singleton inline audio preview. The whole admin shares ONE HTMLAudioElement
 * (created lazily, never attached to the DOM) so list pages can render a
 * play/pause button per row without instantiating an <audio> per row.
 * Starting a new src implicitly stops whatever was playing before.
 */
export type AudioPreviewState = {
	/** s3 URL currently loaded into the shared element (null = idle). */
	src: string | null;
	playing: boolean;
	currentTime: number;
	duration: number;
};

const idle: AudioPreviewState = { src: null, playing: false, currentTime: 0, duration: 0 };

const state = writable<AudioPreviewState>(idle);

let element: HTMLAudioElement | null = null;
let loadedSrc: string | null = null;

function ensureElement(): HTMLAudioElement | null {
	if (!browser) return null;
	if (element) return element;
	element = new Audio();
	element.preload = 'none';
	element.addEventListener('play', () => state.update((s) => ({ ...s, playing: true })));
	element.addEventListener('pause', () => state.update((s) => ({ ...s, playing: false })));
	element.addEventListener('ended', () =>
		state.update((s) => ({ ...s, playing: false, currentTime: 0 }))
	);
	element.addEventListener('timeupdate', () =>
		state.update((s) => ({ ...s, currentTime: element?.currentTime ?? 0 }))
	);
	element.addEventListener('durationchange', () => {
		const duration = element?.duration ?? NaN;
		state.update((s) => ({ ...s, duration: Number.isFinite(duration) ? duration : 0 }));
	});
	element.addEventListener('error', () => {
		loadedSrc = null;
		state.set(idle);
	});
	return element;
}

export const audioPreview = {
	subscribe: state.subscribe,

	/** Play `src`, or pause/resume it if it's already the active track. */
	toggle(src: string): void {
		const audio = ensureElement();
		if (!audio) return;
		if (loadedSrc === src) {
			if (audio.paused) void audio.play().catch(() => {});
			else audio.pause();
			return;
		}
		loadedSrc = src;
		audio.src = src;
		state.set({ src, playing: false, currentTime: 0, duration: 0 });
		void audio.play().catch(() => {});
	},

	/** Hard stop + unload. Call when leaving a page that offers previews. */
	stop(): void {
		if (element) {
			element.pause();
			element.removeAttribute('src');
			element.load();
		}
		loadedSrc = null;
		state.set(idle);
	}
};
