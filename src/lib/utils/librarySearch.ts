import { buildFuzzySearchPattern } from './searchText';

export const libraryTypes = [
	'sermons',
	'songs',
	'recordings',
	'transcriptions',
	'documents'
] as const;
export type LibraryType = (typeof libraryTypes)[number];
export const SEARCH_PAGE_SIZE = 20;
export type LibraryFilters = {
	q: string;
	type: LibraryType | '';
	author: string;
	language: string;
	category: string;
	from: string;
	to: string;
	page: number;
};
export type LibraryResult = {
	id: string;
	type: LibraryType;
	title: string;
	author: string;
	category: string;
	languages: string[];
	date: string;
	href: string;
	audioUrl: string;
	pageHref: string;
	code: string;
	snippet: { before: string; match: string; after: string };
	startSec: number | null;
	page: number | null;
};
export type LibraryResponse = {
	results: LibraryResult[];
	total: number;
	page: number;
	pages: number;
};

export function parseLibraryFilters(params: URLSearchParams): LibraryFilters {
	const bounded = (key: string, max = 100) => {
		const value = (params.get(key) ?? '').trim();
		if (value.length > max) throw new Error('invalid');
		return value;
	};
	const type = bounded('type');
	const language = bounded('language');
	if (type && !libraryTypes.includes(type as LibraryType)) throw new Error('invalid');
	if (language && !['fr', 'en', 'rw', 'sw', 'unknown'].includes(language))
		throw new Error('invalid');
	const from = bounded('from'),
		to = bounded('to');
	for (const date of [from, to]) {
		if (
			date &&
			(!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
				!Number.isFinite(Date.parse(date)) ||
				new Date(date).toISOString().slice(0, 10) !== date)
		)
			throw new Error('invalid');
	}
	if (from && to && from > to) throw new Error('invalid');
	const page = Number(params.get('page') || '1');
	if (!Number.isInteger(page) || page < 1 || page > 1000) throw new Error('invalid');
	return {
		q: bounded('q'),
		type: type as LibraryType | '',
		language,
		author: bounded('author'),
		category: bounded('category'),
		from,
		to,
		page
	};
}

export function libraryHref(
	filters: Partial<LibraryFilters>,
	changes: Partial<LibraryFilters> = {}
) {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries({ ...filters, ...changes })) {
		if (value && !(key === 'page' && value === 1)) params.set(key, String(value));
	}
	return `/recherche?${params}`;
}

export function searchSnippet(text: string, query: string) {
	const clean = text
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	const match = new RegExp(buildFuzzySearchPattern(query), 'i').exec(clean);
	if (!match)
		return { before: clean.slice(0, 180), match: '', after: clean.length > 180 ? '…' : '' };
	const start = Math.max(0, match.index - 70),
		end = match.index + match[0].length;
	return {
		before: `${start ? '…' : ''}${clean.slice(start, match.index)}`,
		match: match[0],
		after: `${clean.slice(end, end + 110)}${clean.length > end + 110 ? '…' : ''}`
	};
}

/** Never render executable URLs from legacy/imported metadata. */
export function publicAssetUrl(value: unknown): string {
	if (typeof value !== 'string') return '';
	try {
		const url = new URL(value);
		return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
			? url.href
			: '';
	} catch {
		return '';
	}
}
