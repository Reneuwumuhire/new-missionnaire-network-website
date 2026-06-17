import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Reader-comfort settings for the synced transcript (live + replay). Persisted
// locally so a listener's choice (warm/sepia/dark/high-contrast palette + text
// size) carries across visits. SSR renders the default; the saved value is
// applied on the client after hydration — same pattern as i18n/musicHistory.

export type SubtitleTheme = 'cream' | 'sepia' | 'dark' | 'contrast';
export type SubtitleSize = 'sm' | 'md' | 'lg' | 'xl';

export interface SubtitlePrefs {
	theme: SubtitleTheme;
	size: SubtitleSize;
}

// Cream is the default: a warm off-white surface with comfortable (not faint)
// dimming on out-of-focus lines and no text-glow — the most restful starting
// point for long reading.
const DEFAULT_PREFS: SubtitlePrefs = { theme: 'cream', size: 'md' };

const STORAGE_KEY = 'mn_subtitle_prefs';
const THEMES: SubtitleTheme[] = ['cream', 'sepia', 'dark', 'contrast'];
const SIZES: SubtitleSize[] = ['sm', 'md', 'lg', 'xl'];

function readSaved(): SubtitlePrefs {
	if (!browser) return DEFAULT_PREFS;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return DEFAULT_PREFS;
		const parsed = JSON.parse(raw) as Partial<SubtitlePrefs>;
		return {
			theme: THEMES.includes(parsed.theme as SubtitleTheme) ? (parsed.theme as SubtitleTheme) : DEFAULT_PREFS.theme,
			size: SIZES.includes(parsed.size as SubtitleSize) ? (parsed.size as SubtitleSize) : DEFAULT_PREFS.size
		};
	} catch {
		return DEFAULT_PREFS;
	}
}

function persist(value: SubtitlePrefs): void {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
	} catch {
		/* storage unavailable (private mode / quota) — non-fatal */
	}
}

function createSubtitlePrefs() {
	const store = writable<SubtitlePrefs>(DEFAULT_PREFS);
	const { subscribe, set, update } = store;

	return {
		subscribe,
		/** Apply the saved value after hydration (call once from the client). */
		init() {
			if (browser) set(readSaved());
		},
		setTheme(theme: SubtitleTheme) {
			update((p) => {
				const next = { ...p, theme };
				persist(next);
				return next;
			});
		},
		setSize(size: SubtitleSize) {
			update((p) => {
				const next = { ...p, size };
				persist(next);
				return next;
			});
		}
	};
}

export const subtitlePrefs = createSubtitlePrefs();
