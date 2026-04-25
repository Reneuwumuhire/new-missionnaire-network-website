import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export const activeAudioElement = writable<HTMLAudioElement | null>(null);

const STORAGE_KEY = 'missionnaire:audio-resume';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_RESUME_SECONDS = 10;
export const END_THRESHOLD_SECONDS = 10;

export type ResumeState = {
	audioUrl: string;
	time: number;
	duration: number;
	savedAt: number;
	// Snapshot of the sermon-shaped object that was in `$selectAudio` when we
	// recorded. We need it to re-prime the global player when the user clicks
	// Resume on a cold page load (no live `$selectAudio`). Stored as a loose
	// record because the runtime payload includes optional fields beyond the
	// Sermon schema and we don't want to be strict about its shape on read.
	sermon: Record<string, unknown>;
};

let monitorInstalled = false;

// The global audio player creates its <audio> element via `new Audio()` and
// keeps it off the DOM, so it's not reachable with querySelector. Instead we
// patch the constructor and the play() method once at module init — both are
// pure observers (they call through to the originals unchanged) and let any
// component capture the live element by subscribing to activeAudioElement.
export function ensureAudioMonitorInstalled() {
	if (!browser || monitorInstalled) return;
	monitorInstalled = true;

	try {
		const OriginalAudio = window.Audio;
		if (typeof OriginalAudio === 'function') {
			const PatchedAudio = new Proxy(OriginalAudio, {
				construct(target, args) {
					const instance = Reflect.construct(target, args);
					if (instance instanceof HTMLAudioElement) {
						activeAudioElement.set(instance);
					}
					return instance;
				}
			});
			window.Audio = PatchedAudio as typeof window.Audio;
		}
	} catch {
		// Some environments forbid reassigning window.Audio; the play() patch
		// below still catches the element on first interaction.
	}

	try {
		if (typeof HTMLMediaElement !== 'undefined') {
			const originalPlay = HTMLMediaElement.prototype.play;
			HTMLMediaElement.prototype.play = function patchedPlay(this: HTMLMediaElement) {
				if (this instanceof HTMLAudioElement) {
					activeAudioElement.set(this);
				}
				return originalPlay.apply(this);
			};
		}
	} catch {
		// no-op
	}
}

export function readResumeState(): ResumeState | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as ResumeState;
		if (
			!parsed ||
			typeof parsed.audioUrl !== 'string' ||
			typeof parsed.time !== 'number' ||
			typeof parsed.savedAt !== 'number' ||
			!parsed.sermon ||
			typeof parsed.sermon !== 'object'
		) {
			return null;
		}
		if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
			localStorage.removeItem(STORAGE_KEY);
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

export function writeResumeState(state: ResumeState) {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// quota or disabled storage — ignore
	}
}

export function clearResumeState() {
	if (!browser) return;
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// no-op
	}
}

// `currentAudioUrl` is the URL of whatever's loaded in the global player right
// now (or null on a cold page load). We treat null as "no conflict" so the
// toast can surface after the listener fully closes the tab and revisits.
export function isResumeEligible(
	state: ResumeState | null,
	currentAudioUrl: string | null
): state is ResumeState {
	if (!state) return false;
	if (currentAudioUrl && state.audioUrl !== currentAudioUrl) return false;
	if (state.time < MIN_RESUME_SECONDS) return false;
	if (state.duration > 0 && state.duration - state.time < END_THRESHOLD_SECONDS) return false;
	if (Date.now() - state.savedAt > MAX_AGE_MS) return false;
	return true;
}
