import { derived, writable } from 'svelte/store';
import { browser } from '$app/environment';
import fr from './translations/fr';
import en from './translations/en';

export type Locale = 'fr' | 'en';
export type TranslationKey = keyof typeof fr;
type TranslationParams = Record<string, string | number>;

const dictionaries: Record<Locale, Record<TranslationKey, string>> = { fr, en };

const COOKIE_NAME = 'mn_locale';
const STORAGE_KEY = 'mn_locale';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

// SSR always renders French (the canonical language — keeps SEO and the
// service-worker page cache single-variant); the saved locale is applied
// after hydration via initLocale().
export const locale = writable<Locale>('fr');

function isLocale(value: unknown): value is Locale {
	return value === 'fr' || value === 'en';
}

/** Read the saved locale (cookie first, then localStorage). Browser only. */
function readSavedLocale(): Locale | null {
	if (!browser) return null;
	const cookieMatch = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
	if (cookieMatch && isLocale(cookieMatch[1])) return cookieMatch[1];
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (isLocale(stored)) return stored;
	} catch {
		/* storage unavailable */
	}
	return null;
}

/** Apply the saved locale after hydration. Call once from the root layout. */
export function initLocale(): void {
	const saved = readSavedLocale();
	if (saved) {
		locale.set(saved);
		document.documentElement.lang = saved;
	}
}

export function setLocale(next: Locale): void {
	locale.set(next);
	if (!browser) return;
	document.cookie = `${COOKIE_NAME}=${next}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
	try {
		localStorage.setItem(STORAGE_KEY, next);
	} catch {
		/* storage unavailable */
	}
	document.documentElement.lang = next;
}

/**
 * Translation function store. Usage: `$t('errors.retry')` or with
 * placeholders: `$t('list.showing', { from: 1, to: 20, total: 87 })`.
 * Unknown placeholders are left intact; missing EN keys fall back to French.
 */
export const t = derived(locale, ($locale) => {
	return (key: TranslationKey, params?: TranslationParams): string => {
		let message: string = dictionaries[$locale][key] ?? dictionaries.fr[key] ?? key;
		if (params) {
			for (const [name, value] of Object.entries(params)) {
				message = message.replaceAll(`{${name}}`, String(value));
			}
		}
		return message;
	};
});
