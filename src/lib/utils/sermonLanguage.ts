import type { Sermon } from '$lib/models/sermon';

export const sermonLanguages = ['french', 'english', 'kinyarwanda', 'swahili'] as const;
export type SermonLanguage = (typeof sermonLanguages)[number];
export const sermonLanguageFilters = ['all', ...sermonLanguages] as const;
export type SermonLanguageFilter = (typeof sermonLanguageFilters)[number];

export const sermonLanguageCodes: Record<SermonLanguage, 'fr' | 'en' | 'rw' | 'sw'> = {
	french: 'fr',
	english: 'en',
	kinyarwanda: 'rw',
	swahili: 'sw'
};

export type SermonVersion = {
	language: SermonLanguage;
	code: 'fr' | 'en' | 'rw' | 'sw';
	title: string;
	audioUrl: string | null;
	pdfUrl: string | null;
	duration: number | null;
};

export function parseSermonLanguage(value: unknown): SermonLanguage {
	const aliases: Record<string, SermonLanguage> = {
		fr: 'french',
		en: 'english',
		rw: 'kinyarwanda',
		sw: 'swahili'
	};
	if (typeof value !== 'string') return 'french';
	const normalized = value.toLowerCase();
	return (
		aliases[normalized] ??
		(sermonLanguages.includes(normalized as SermonLanguage)
			? (normalized as SermonLanguage)
			: 'french')
	);
}

export function parseSermonLanguageFilter(value: unknown): SermonLanguageFilter {
	return typeof value === 'string' && value.toLowerCase() === 'all'
		? 'all'
		: parseSermonLanguage(value);
}

export function getSermonVersion(
	sermon: Sermon,
	language: SermonLanguage = 'french'
): SermonVersion {
	const fallbackTitle = sermon.french_title || sermon.english_title || 'Sans titre';

	if (language === 'english') {
		return {
			language,
			code: 'en',
			title: sermon.english_title || fallbackTitle,
			audioUrl: sermon.english_audio_url || null,
			pdfUrl: sermon.english_pdf_url || null,
			duration: sermon.english_duration ?? null
		};
	}

	if (language === 'kinyarwanda' || language === 'swahili') {
		const code = language === 'kinyarwanda' ? 'rw' : 'sw';
		const localized = sermon.localizations?.[code];
		return {
			language,
			code,
			title: localized?.title || fallbackTitle,
			audioUrl: localized?.audio_url || null,
			pdfUrl: localized?.pdf_url || null,
			duration: localized?.duration ?? null
		};
	}

	return {
		language,
		code: 'fr',
		title: fallbackTitle,
		audioUrl: sermon.mp3_url || null,
		pdfUrl: sermon.pdf_url || null,
		duration: sermon.duration ?? null
	};
}

export function availableSermonVersions(sermon: Sermon): SermonVersion[] {
	return sermonLanguages
		.map((language) => getSermonVersion(sermon, language))
		.filter((version) => Boolean(version.audioUrl || version.pdfUrl));
}
