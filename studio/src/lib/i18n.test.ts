import { beforeEach, describe, expect, it } from 'vitest';
import en from './translations/en';
import fr from './translations/fr';
import { i18n, setLocale, t } from './i18n.svelte';

describe('translations', () => {
	// The locale is module state, so one test's switch would leak into the next.
	beforeEach(() => setLocale('en'));

	it('defaults to English', () => {
		// The whole point of the setting: an operator who has never opened
		// Settings gets English.
		expect(i18n.locale).toBe('en');
		expect(t('dock.audioMixer')).toBe('Audio Mixer');
	});

	it('covers every English key in French, with nothing spare', () => {
		expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
	});

	it('has no French entry left identical to a placeholder key', () => {
		for (const [key, value] of Object.entries(fr)) {
			expect(value, `${key} is untranslated`).not.toBe(key);
			expect(value.trim().length, `${key} is empty`).toBeGreaterThan(0);
		}
	});

	it('keeps the same placeholders in both languages', () => {
		// A dropped {count} would render a sentence with a hole in it.
		const placeholders = (s: string) => (s.match(/\{[a-z]+\}/gi) ?? []).sort();
		for (const key of Object.keys(en) as (keyof typeof en)[]) {
			expect(placeholders(fr[key]), `${key} placeholders`).toEqual(placeholders(en[key]));
		}
	});

	it('switches language and substitutes parameters', () => {
		setLocale('fr');
		expect(t('dock.audioMixer')).toBe('Mélangeur audio');
		expect(t('status.fps', { actual: 30, target: 30 })).toBe('30 / 30 ips');
		setLocale('en');
		expect(t('status.fps', { actual: 30, target: 30 })).toBe('30 / 30 fps');
	});

	it('distinguishes the private preview signal from going public', () => {
		expect(t('controls.startStreaming')).toBe('Start Preview Signal');
		expect(t('controls.goLive')).toBe('Go Live — YouTube + Missionnaire');
		expect(t('controls.studioMode')).toBe('Studio Mode');
		expect(t('dock.sceneTransitions')).toBe('Scene Transitions');
		setLocale('fr');
		expect(t('controls.studioMode')).toBe('Mode Studio');
		expect(t('controls.settings')).toBe('Paramètres');
		setLocale('en');
	});
});
