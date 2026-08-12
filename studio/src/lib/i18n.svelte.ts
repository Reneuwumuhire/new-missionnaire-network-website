// Same shape as the admin panel's i18n, minus the SvelteKit store plumbing —
// `t()` reads a rune, so any markup that calls it re-renders on a language
// change without a subscription.
//
// English is canonical and the default. French is a deliberate choice, not a
// guess from the system locale: the operator picks it once in Settings and it
// sticks.

import en from './translations/en';
import fr from './translations/fr';

export type Locale = 'en' | 'fr';
export type TranslationKey = keyof typeof en;
type Params = Record<string, string | number>;

const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = { en, fr };

export const LOCALES: { id: Locale; label: string }[] = [
	{ id: 'en', label: 'English' },
	{ id: 'fr', label: 'Français' }
];

const STORE_KEY = 'missionnaire-studio-locale';

function load(): Locale {
	try {
		const saved = localStorage.getItem(STORE_KEY);
		if (saved === 'en' || saved === 'fr') return saved;
	} catch {
		// Storage unavailable — English it is.
	}
	return 'en';
}

export const i18n = $state({ locale: load() });

export function setLocale(next: Locale) {
	i18n.locale = next;
	// Neither of these is essential to switching language, and both can be
	// absent (no DOM, storage denied). Failing here must not leave the app
	// half-switched.
	try {
		document.documentElement.lang = next;
		localStorage.setItem(STORE_KEY, next);
	} catch {
		/* nothing to do */
	}
}

export type Theme = 'dark' | 'light' | 'midnight';

/** Dark is first because it is the default, and the order is the order the
 *  picker shows: by how much light the room has. */
export const THEMES: { id: Theme; label: () => string }[] = [
	{ id: 'dark', label: () => t('settings.themeDark') },
	{ id: 'light', label: () => t('settings.themeLight') },
	{ id: 'midnight', label: () => t('settings.themeMidnight') }
];

const THEME_KEY = 'missionnaire-studio-theme';

function loadTheme(): Theme {
	try {
		const saved = localStorage.getItem(THEME_KEY);
		return THEMES.some((option) => option.id === saved) ? (saved as Theme) : 'dark';
	} catch {
		return 'dark';
	}
}

export const theme = $state({ current: loadTheme() });

export function applyTheme(next: Theme = theme.current) {
	theme.current = next;
	try {
		// Every theme but the default owns a class, and only one may be on: the
		// tokens all live at the same specificity, so two classes would leave the
		// winner to source order rather than to the choice.
		const root = document.documentElement;
		for (const option of THEMES) root.classList.toggle(option.id, option.id === next);
		root.classList.remove('dark');
		localStorage.setItem(THEME_KEY, next);
	} catch {
		/* no DOM or no storage — the choice simply is not remembered */
	}
}

/** `t('dock.scenes')`, or with placeholders `t('preview.canvas', { width, height })`.
 *  A key missing from French falls back to English rather than showing the raw
 *  key on air. */
export function t(key: TranslationKey, params?: Params): string {
	let message: string = DICTIONARIES[i18n.locale][key] ?? DICTIONARIES.en[key] ?? key;
	if (params) {
		for (const [name, value] of Object.entries(params)) {
			message = message.replaceAll(`{${name}}`, String(value));
		}
	}
	return message;
}
