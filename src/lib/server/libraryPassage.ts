import { ObjectId, type Db } from 'mongodb';
import { error } from '@sveltejs/kit';
import { getDb } from '../../db/mongo';
import { libraryCollections, librarySourcePipeline, toLibraryResult } from './librarySearch';
import {
	libraryTypes,
	parseLibraryFilters,
	publicAssetUrl,
	type LibraryType
} from '../utils/librarySearch';
import {
	highlightedSegments,
	passageOccurrences,
	passageRanges,
	type PassagePart
} from '../utils/passageSearch';

/** The reader uses the same attachment and publication gates as search. */
export async function loadLibrarySource(
	type: string,
	id: string,
	params: URLSearchParams,
	database?: Db
) {
	if (!libraryTypes.includes(type as LibraryType) || !/^[a-f\d]{24}$/i.test(id)) error(404);
	let filters;
	try {
		filters = parseLibraryFilters(params);
	} catch {
		error(400, 'Invalid search');
	}
	const db = database ?? (await getDb());
	const [row] = await db
		.collection(libraryCollections[type as LibraryType])
		.aggregate(
			[
				{ $match: { _id: { $in: [new ObjectId(id), id] } } },
				...librarySourcePipeline(type as LibraryType, filters, false, true)
			],
			{ maxTimeMS: 5000 }
		)
		.toArray();
	if (!row) error(404);
	const all = (row.parts ?? []) as PassagePart[];
	const asset = params.get('asset') || all[0]?.url || '';
	const parts = all.filter((part) => (part.url || '') === asset && typeof part.text === 'string');
	if (!parts.length) error(404, 'Published text is no longer available');
	return { row, parts, filters, asset: publicAssetUrl(asset) };
}

export async function readLibraryPassage(
	type: string,
	id: string,
	params: URLSearchParams,
	database?: Db
) {
	const { row, parts, filters, asset } = await loadLibrarySource(type, id, params, database);
	if (filters.q.length < 2) error(400, 'A search phrase is required');
	const { text, spans, matches } = passageOccurrences(parts, filters.q, filters.match);
	if (!matches.length) error(404, 'This passage is no longer available');
	const occurrence = Number(params.get('occurrence') || '1');
	if (!Number.isSafeInteger(occurrence) || occurrence < 1 || occurrence > matches.length)
		error(404);
	const selected = matches[occurrence - 1];
	const first = spans.findIndex((span) => span.end > selected.start);
	const last = spans.findIndex((span) => span.end >= selected.end);
	const part = spans[first];
	// PDF context stays on matching pages: never prepend a cover or running
	// header from another page to the reader's selected passage.
	const start = Math.max(part.page ? part.start : 0, selected.start - 280),
		end = Math.min(part.page ? spans[last].end : text.length, selected.end + 600);
	const result = toLibraryResult({ ...row, part }, filters.q, filters.match, filters.language);
	return {
		result,
		query: filters.q,
		mode: filters.match || 'phrase',
		occurrence,
		count: matches.length,
		segments: highlightedSegments(
			text.slice(start, end),
			filters.match === 'words'
				? passageRanges(text.slice(start, end), filters.q, 'words')
				: [{ start: selected.start - start, end: selected.end - start }]
		),
		asset,
		// Only matching pages, not the complete extracted book, enter the HTML response.
		pages: spans
			.slice(first, last + 1)
			.filter((span) => span.page)
			.map((span) => {
				const localStart = Math.max(0, selected.start - span.start);
				const phrase = span.text.slice(
					localStart,
					Math.min(span.text.length, selected.end - span.start)
				);
				return {
					page: span.page!,
					phrase,
					matchIndex: passageRanges(span.text, phrase).filter((range) => range.start < localStart)
						.length
				};
			}),
		before: start > 0,
		after: end < text.length
	};
}
