import { describe, it, expect } from 'vitest';
import { parseLibraryFilters, libraryHref, searchSnippet, publicAssetUrl } from './librarySearch';
import { buildFuzzySearchPattern } from './searchText';

describe('library search boundaries', () => {
	it('parses and preserves filters in pagination links', () => {
		const filters = parseLibraryFilters(
			new URLSearchParams(
				'q=gr%C3%A2ce&type=songs&language=fr&author=Samonte&category=Chorus&from=2025-01-01&to=2025-12-31'
			)
		);
		expect(
			parseLibraryFilters(
				new URL(libraryHref(filters, { page: 2 }), 'https://example.com').searchParams
			)
		).toEqual({ ...filters, page: 2 });
	});
	it.each([
		'page=-1',
		'page=2.5',
		'page=1001',
		'type=private',
		'language=zz',
		'from=2025-02-30',
		'from=2026-01-01&to=2025-01-01',
		`q=${'a'.repeat(501)}`,
		'match=invalid'
	])('rejects invalid %s', (query) => {
		expect(() => parseLibraryFilters(new URLSearchParams(query))).toThrow();
	});
	it('matches accents and treats regex punctuation literally', () => {
		expect(new RegExp(buildFuzzySearchPattern('grace'), 'i').test('GRÂCE')).toBe(true);
		expect(new RegExp(buildFuzzySearchPattern('grâce'), 'i').test('grâce')).toBe(true);
		for (const value of ['[test]', 'C++', '(a+)+', '.*', 'a\\b']) {
			const regex = new RegExp(buildFuzzySearchPattern(value), 'i');
			expect(regex.test(value)).toBe(true);
			expect(regex.test('unrelated')).toBe(false);
		}
	});
	it('returns bounded text-only excerpts', () => {
		const snippet = searchSnippet(
			`${'avant '.repeat(50)}<b>grâce</b>${' après'.repeat(50)}`,
			'grace'
		);
		expect(snippet.match).toBe('grâce');
		expect(snippet.before.startsWith('…')).toBe(true);
		expect(snippet.after.endsWith('…')).toBe(true);
		expect(JSON.stringify(snippet)).not.toContain('<b>');
	});
	it('rejects executable and credential-bearing asset URLs', () => {
		for (const value of [
			'javascript:alert(1)',
			'data:text/html,hello',
			'//evil.test',
			'https://user:secret@host.test/a'
		])
			expect(publicAssetUrl(value)).toBe('');
		expect(publicAssetUrl('https://host.test/file.pdf')).toBe('https://host.test/file.pdf');
	});
});
