import { buildFuzzySearchPattern } from './searchText';

export const MAX_PASSAGE_QUERY = 500;
export type PassageMode = 'phrase' | 'words';
export type TextRange = { start: number; end: number };
export type PassagePart = {
	text: string;
	page?: number;
	startMs?: number;
	id?: string;
	url?: string;
};

// ponytail: bounded cross-part context, not an unbounded whole-book regex copy.
// Raise this shared window only if real quotations span more intervening whitespace.
export const passageOverlap = (query: string) => Math.max(256, query.length * 24);

export function phraseWords(query: string) {
	return query.normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function passageWordPatterns(query: string) {
	return phraseWords(query).map(
		(word) => `(?<![\\p{L}\\p{N}])${buildFuzzySearchPattern(word)}(?![\\p{L}\\p{N}])`
	);
}

/** Same Unicode-aware pattern is used by Mongo, the reader and PDF text layers. */
export function passagePattern(query: string, mode: PassageMode = 'phrase') {
	const words = phraseWords(query);
	if (mode === 'phrase' && words.length <= 1) return buildFuzzySearchPattern(query);
	if (!words.length) return buildFuzzySearchPattern(query);
	const patterns = passageWordPatterns(query);
	if (mode === 'words')
		return '^' + patterns.map((p) => `(?=[\\s\\S]*${p})`).join('') + '[\\s\\S]+';
	return patterns.join('[^\\p{L}\\p{N}]+');
}

export function passageRanges(
	text: string,
	query: string,
	mode: PassageMode = 'phrase'
): TextRange[] {
	if (!query.trim()) return [];
	const pattern = mode === 'words' ? passageWordPatterns(query).join('|') : passagePattern(query);
	if (!pattern) return [];
	return [...text.matchAll(new RegExp(pattern, 'giu'))]
		.filter((match) => match[0].length)
		.map((match) => ({ start: match.index, end: match.index + match[0].length }));
}

export function highlightedSegments(text: string, ranges: TextRange[]) {
	const segments: { text: string; marked: boolean }[] = [];
	let cursor = 0;
	for (const range of ranges) {
		const start = Math.max(cursor, range.start),
			end = Math.min(text.length, range.end);
		if (end <= start) continue;
		if (start > cursor) segments.push({ text: text.slice(cursor, start), marked: false });
		segments.push({ text: text.slice(start, end), marked: true });
		cursor = end;
	}
	if (cursor < text.length) segments.push({ text: text.slice(cursor), marked: false });
	return segments;
}

/** Join only one source attachment at a time: never manufacture a quotation
 * between French/English PDFs or unrelated files. Offsets are UTF-16 for DOM Range. */
export function joinPassageParts(parts: PassagePart[]) {
	let text = '';
	const spans = parts.map((part) => {
		if (text) text += '\n';
		const start = text.length;
		text += part.text;
		return { ...part, start, end: text.length };
	});
	return { text, spans };
}

/** Similar passages must contain every word in the same bounded context as search. */
export function passageOccurrences(
	parts: PassagePart[],
	query: string,
	mode: PassageMode = 'phrase'
) {
	const joined = joinPassageParts(parts);
	if (mode === 'phrase') return { ...joined, matches: passageRanges(joined.text, query) };
	const regex = new RegExp(passagePattern(query, mode), 'iu');
	const matches: TextRange[] = [];
	for (const span of joined.spans) {
		const start = Math.max(0, span.start - passageOverlap(query));
		const context = joined.text.slice(start, span.end);
		if (!regex.test(context)) continue;
		const ranges = passageRanges(context, query, mode);
		if (!ranges.length) continue;
		const match = { start: start + ranges[0].start, end: start + ranges.at(-1)!.end };
		if (!matches.length || match.start >= matches.at(-1)!.end) matches.push(match);
	}
	return { ...joined, matches };
}
