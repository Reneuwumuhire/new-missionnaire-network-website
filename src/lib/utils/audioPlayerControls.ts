import { browser } from '$app/environment';

type AudioPlayerAction = 'toggle' | 'play' | 'pause';

export function dispatchAudioPlayerAction(action: AudioPlayerAction) {
	if (!browser) return;
	window.dispatchEvent(new CustomEvent(`missionnaire-audio-${action}`));
}
