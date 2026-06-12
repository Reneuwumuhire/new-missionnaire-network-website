import { browser } from '$app/environment';

type AudioPlayerAction = 'toggle' | 'play' | 'pause';

export function dispatchAudioPlayerAction(action: AudioPlayerAction) {
	if (!browser) return;
	window.dispatchEvent(new CustomEvent(`missionnaire-audio-${action}`));
}

/** Seek the global player to an absolute position (seconds). Used by the
 *  replay transcript when the listener taps a cue. */
export function dispatchAudioPlayerSeek(timeSec: number) {
	if (!browser) return;
	window.dispatchEvent(new CustomEvent('missionnaire-audio-seek', { detail: { time: timeSec } }));
}
