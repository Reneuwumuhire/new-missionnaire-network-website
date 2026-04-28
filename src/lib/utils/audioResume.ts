import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export const activeAudioElement = writable<HTMLAudioElement | null>(null);

// Hint that the next user-initiated play() should seek to a specific time
// before starting playback. Set by the resume recorder right after a cold-
// load rehydration: iOS routinely clamps `currentTime` assignments to 0
// when metadata isn't fully loaded yet, so a loadedmetadata-driven seek
// alone isn't reliable. The AudioPlayer's safePlay path consumes this and
// forces a full load() + canplay-driven seek + play(), which always lands
// at the right position.
//
// The URL is included so a hint left over from a previous track is ignored
// once the user navigates to something else — the seek is per-track.
export const pendingPlaybackSeek = writable<{ url: string; time: number } | null>(null);

const STORAGE_KEY = 'missionnaire:audio-resume';
const PLAYER_SNAPSHOT_KEY = 'missionnaire:player-snapshot';
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

// Generic player snapshot for cold-load rehydration. Unlike `ResumeState`
// (sermon-only, drives the explicit "Reprendre l'écoute" toast), this
// captures the entire player state — selected track, playlist, index,
// shuffle/auto-next flags — so the bottom bar can come back transparently
// after iOS reloads the PWA mid-listen (phone calls, OS audio interruption,
// memory pressure). Saved for music + sermons + assets; the rehydration
// gate reads `intendsToPlay` so we only restore when the user was actively
// listening, never when they had paused or closed the player.
export type PlayerSnapshot = {
	selectAudio: Record<string, unknown>;
	playlist: Record<string, unknown>[];
	basePlaylist: Record<string, unknown>[];
	currentIndex: number;
	currentTime: number;
	duration: number;
	intendsToPlay: boolean;
	autoNext: boolean;
	isShuffle: boolean;
	savedAt: number;
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

export function readPlayerSnapshot(): PlayerSnapshot | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(PLAYER_SNAPSHOT_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as PlayerSnapshot;
		if (
			!parsed ||
			typeof parsed !== 'object' ||
			!parsed.selectAudio ||
			typeof parsed.selectAudio !== 'object' ||
			!Array.isArray(parsed.playlist) ||
			!Array.isArray(parsed.basePlaylist) ||
			typeof parsed.currentIndex !== 'number' ||
			typeof parsed.currentTime !== 'number' ||
			typeof parsed.savedAt !== 'number'
		) {
			return null;
		}
		if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
			localStorage.removeItem(PLAYER_SNAPSHOT_KEY);
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

export function writePlayerSnapshot(state: PlayerSnapshot) {
	if (!browser) return;
	try {
		localStorage.setItem(PLAYER_SNAPSHOT_KEY, JSON.stringify(state));
	} catch {
		// quota or disabled storage — ignore
	}
}

export function clearPlayerSnapshot() {
	if (!browser) return;
	try {
		localStorage.removeItem(PLAYER_SNAPSHOT_KEY);
	} catch {
		// no-op
	}
}
