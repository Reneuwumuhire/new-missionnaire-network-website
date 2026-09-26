import { describe, expect, it } from 'vitest';
import {
	availableSermonVersions,
	getSermonVersion,
	parseSermonLanguage,
	parseSermonLanguageFilter
} from './sermonLanguage';
import type { Sermon } from '$lib/models/sermon';

const sermon: Sermon = {
	full_date_code: '64-0629',
	date_code: '64-0629',
	author: 'William Marrion Branham',
	english_title: 'The Mighty God Unveiled Before Us',
	french_title: 'Le Dieu puissant dévoilé devant nous',
	localizations: {
		rw: {
			title: 'Imana Ikomeye Ihishuye Imbere yacu',
			audio_url: 'https://example.com/rw.m4a',
			pdf_url: 'https://example.com/rw.pdf'
		}
	}
};

describe('sermon language versions', () => {
	it('keeps translations on one sermon record', () => {
		expect(getSermonVersion(sermon, 'kinyarwanda')).toMatchObject({
			title: 'Imana Ikomeye Ihishuye Imbere yacu',
			audioUrl: 'https://example.com/rw.m4a',
			pdfUrl: 'https://example.com/rw.pdf'
		});
		expect(availableSermonVersions(sermon).map(({ code }) => code)).toEqual(['rw']);
	});

	it('accepts language names and short codes', () => {
		expect(parseSermonLanguage('RW')).toBe('kinyarwanda');
		expect(parseSermonLanguage('Swahili')).toBe('swahili');
		expect(parseSermonLanguage('unknown')).toBe('french');
		expect(parseSermonLanguageFilter('ALL')).toBe('all');
	});
});
