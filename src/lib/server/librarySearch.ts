import type { Db, Document } from 'mongodb';
import { getDb } from '../../db/mongo';
import { buildSermonSlug } from '../../utils/sermonSlug';
import { buildFuzzySearchPattern } from '$lib/utils/searchText';
import {
	passagePattern,
	passageWordPatterns,
	phraseWords,
	type PassageMode
} from '$lib/utils/passageSearch';
import { firstPassage } from './passageExpression';
import {
	libraryTypes,
	SEARCH_PAGE_SIZE,
	publicAssetUrl,
	searchSnippet,
	type LibraryFilters,
	type LibraryResult,
	type LibraryResponse,
	type LibraryType
} from '$lib/utils/librarySearch';

export const libraryCollections: Record<LibraryType, string> = {
	sermons: 'sermons',
	songs: 'music_audio',
	recordings: 'recordings',
	transcriptions: 'pdfs',
	documents: 'literature'
};
const fallback = (value: unknown, otherwise: unknown = '') => ({ $ifNull: [value, otherwise] });
const present = (value: unknown) => ({ $ne: [fallback(value), ''] });
const language = (field: unknown) => ({
	$switch: {
		branches: [
			{ case: { $in: [field, ['fr', 'french', 'francais', 'français']] }, then: 'fr' },
			{ case: { $in: [field, ['en', 'english']] }, then: 'en' },
			{ case: { $in: [field, ['rw', 'kinyarwanda']] }, then: 'rw' },
			{ case: { $in: [field, ['sw', 'swahili']] }, then: 'sw' }
		],
		default: 'unknown'
	}
});

// Read extracted text only while its URL still matches a current attachment.
// Replacing/hiding a file immediately invalidates old text without waiting for re-indexing.
function indexedParts(urls: unknown, f: LibraryFilters, reader = false) {
	const assets = {
		$filter: {
			input: fallback('$library_search', []),
			as: 'asset',
			cond: { $and: [{ $in: ['$$asset.url', urls] }, present('$$asset.url')] }
		}
	};
	if (reader)
		return {
			$reduce: {
				input: assets,
				initialValue: [],
				in: {
					$concatArrays: [
						'$$value',
						{
							$map: {
								input: fallback('$$this.parts', []),
								as: 'part',
								in: { $mergeObjects: ['$$part', { url: '$$this.url' }] }
							}
						}
					]
				}
			}
		};
	return {
		$reduce: {
			input: assets,
			initialValue: [],
			in: {
				$cond: [
					{ $gt: [{ $size: '$$value' }, 0] },
					'$$value',
					{
						$let: {
							vars: { hit: firstPassage(fallback('$$this.parts', []), f.q, f.match) },
							in: { $cond: ['$$hit', [{ $mergeObjects: ['$$hit', { url: '$$this.url' }] }], []] }
						}
					}
				]
			}
		}
	};
}

// Whole-word candidate lookup only; the existing literal matcher still validates
// phrases, punctuation and current attachment/language boundaries afterwards.
export function libraryTextTerm(query: string) {
	return (
		(query.normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? []).sort(
			(a, b) => b.length - a.length
		)[0] ?? ''
	);
}

// A three-word anchor either fits in one part, or its first words reach that part's end.
// This cheap native predicate discards non-candidates BEFORE the cross-page
// reducer. Prefix alternatives retain quotations spanning any number of cues.
export function libraryPhraseCandidate(query: string) {
	const tokens = phraseWords(query);
	const longest = tokens.findIndex((word) => word === libraryTextTerm(query));
	const start = Math.min(longest, Math.max(0, tokens.length - 3));
	const anchor = tokens.slice(start, start + 3).join(' ');
	const words = passageWordPatterns(anchor);
	let prefix = words.at(-1) ?? '';
	for (let i = words.length - 2; i >= 0; i--) prefix = `${words[i]}(?:[^\\p{L}\\p{N}]+${prefix})?`;
	return `(?:${passagePattern(anchor)})|(?:${prefix})[^\\p{L}\\p{N}]*$`;
}

export function librarySourcePipeline(
	type: LibraryType,
	f: LibraryFilters,
	content = false,
	reader = false
): Document[] {
	const regex = buildFuzzySearchPattern(f.q);
	const textTerm = libraryTextTerm(f.q);
	const stages: Document[] = [
		...(content ? [{ $match: { $text: { $search: textTerm, $language: 'none' } } }] : []),
		...(content && f.match !== 'words' && passageWordPatterns(f.q).length >= 4
			? [
					{
						$match: {
							'library_search.parts.text': { $regex: libraryPhraseCandidate(f.q), $options: 'i' }
						}
					}
				]
			: []),
		{
			$match:
				type === 'recordings'
					? { published: true, status: 'ready' }
					: {
							published: { $ne: false },
							status: { $nin: ['draft', 'scheduled', 'archived', 'private'] }
						}
		}
	];
	const fields: Document = {
		_id: 0,
		id: { $toString: '$_id' },
		type: { $literal: type },
		title: fallback('$title'),
		author: fallback('$author'),
		category: fallback('$category'),
		date: '',
		audioUrl: '',
		url: '',
		languages: [language('$language')],
		parts: [],
		description: fallback('$description'),
		alternateTitle: '',
		code: '',
		offsetMs: { $literal: 0 }
	};
	if (type === 'sermons') {
		const localized =
			f.language === 'en'
				? {
						title: '$english_title',
						alternateTitle: '$french_title',
						audio: '$english_audio_url',
						pdf: '$english_pdf_url'
					}
				: f.language === 'rw'
					? {
							title: '$localizations.rw.title',
							alternateTitle: '$english_title',
							audio: '$localizations.rw.audio_url',
							pdf: '$localizations.rw.pdf_url'
						}
					: f.language === 'sw'
						? {
								title: '$localizations.sw.title',
								alternateTitle: '$english_title',
								audio: '$localizations.sw.audio_url',
								pdf: '$localizations.sw.pdf_url'
							}
						: {
								title: '$french_title',
								alternateTitle: '$english_title',
								audio: '$mp3_url',
								pdf: '$pdf_url'
							};
		Object.assign(fields, {
			title: fallback(localized.title, fallback('$english_title')),
			alternateTitle: fallback(localized.alternateTitle),
			french_title: 1,
			english_title: 1,
			date_code: 1,
			full_date_code: 1,
			iso_date: 1,
			code: fallback('$full_date_code'),
			date: fallback('$iso_date'),
			audioUrl: fallback(localized.audio),
			url: fallback(localized.pdf),
			languages: {
				$concatArrays: [
					{ $cond: [{ $or: [present('$mp3_url'), present('$pdf_url')] }, ['fr'], []] },
					{
						$cond: [
							{ $or: [present('$english_audio_url'), present('$english_pdf_url')] },
							['en'],
							[]
						]
					},
					{
						$cond: [
							{
								$or: [present('$localizations.rw.audio_url'), present('$localizations.rw.pdf_url')]
							},
							['rw'],
							[]
						]
					},
					{
						$cond: [
							{
								$or: [present('$localizations.sw.audio_url'), present('$localizations.sw.pdf_url')]
							},
							['sw'],
							[]
						]
					}
				]
			},
			parts:
				content || reader
					? indexedParts(
							f.language
								? [localized.pdf]
								: [
										'$pdf_url',
										'$english_pdf_url',
										'$localizations.rw.pdf_url',
										'$localizations.sw.pdf_url'
									],
							f,
							reader
						)
					: []
		});
	} else if (type === 'songs') {
		stages.push(
			{ $set: { lyricIds: ['$_id', { $toString: '$_id' }] } },
			{
				$lookup: {
					from: 'music_lyrics',
					localField: 'lyricIds',
					foreignField: 'audio_id',
					pipeline: [
						{ $match: { lyrics_status: 'published' } },
						{ $project: { lines: 1, timeline_published: 1 } },
						{ $limit: 1 }
					],
					as: 'lyrics'
				}
			}
		);
		Object.assign(fields, {
			author: fallback('$artist'),
			category: fallback('$category', fallback('$book')),
			audioUrl: fallback('$s3_url'),
			date: '$uploaded_at',
			parts: fallback({ $arrayElemAt: ['$lyrics.lines', 0] }, []),
			timeline: fallback({ $arrayElemAt: ['$lyrics.timeline_published', 0] }, [])
		});
	} else if (type === 'recordings') {
		stages.push(
			{
				$lookup: {
					from: 'scheduled_lives',
					let: { id: { $toString: '$_id' } },
					pipeline: [
						{ $match: { $expr: { $eq: ['$recording_id', '$$id'] } } },
						{
							$project: {
								subtitle_srt_url: 1,
								subtitle_srt_s3_key: 1,
								subtitle_anchor_epoch_ms: 1,
								subtitle_offset_ms: 1
							}
						},
						{ $limit: 1 }
					],
					as: 'scheduled'
				}
			},
			{ $set: { scheduled: { $arrayElemAt: ['$scheduled', 0] } } }
		);
		const direct = {
			$and: [present('$subtitle_srt_s3_key'), { $isNumber: '$subtitle_offset_into_recording_ms' }]
		};
		const subtitleUrl = { $cond: [direct, '$subtitle_srt_url', '$scheduled.subtitle_srt_url'] };
		const offset = {
			$cond: [
				direct,
				'$subtitle_offset_into_recording_ms',
				{
					$subtract: [
						{
							$add: [
								'$scheduled.subtitle_anchor_epoch_ms',
								fallback('$scheduled.subtitle_offset_ms', 0)
							]
						},
						{
							$convert: {
								input: {
									$convert: { input: '$started_at', to: 'date', onError: null, onNull: null }
								},
								to: 'long',
								onError: null,
								onNull: null
							}
						}
					]
				}
			]
		};
		Object.assign(fields, {
			date: '$started_at',
			author: fallback('$speaker', fallback('$author')),
			audioUrl: fallback(
				f.language === 'fr'
					? { $cond: [present('$french_audio_s3_url'), '$french_audio_s3_url', '$s3_url'] }
					: '$s3_url'
			),
			languages: {
				$setUnion: [
					[language(fallback('$original_audio_language', 'rw'))],
					{ $cond: [present('$french_audio_s3_url'), ['fr'], []] }
				]
			},
			offsetMs: offset,
			// Original-track subtitle timestamps must not seek a separately dubbed track.
			canSeekPart:
				f.language === 'fr' ? { $not: [present('$french_audio_s3_url')] } : { $literal: true },
			parts: {
				$cond: [
					{ $and: [{ $ne: ['$subtitles_hidden', true] }, { $isNumber: offset }] },
					content || reader ? indexedParts([subtitleUrl], f, reader) : [],
					[]
				]
			}
		});
	} else if (type === 'transcriptions') {
		// PDFs linked to a recording inherit its publication boundary.
		stages.push(
			{
				$set: {
					recordingObjectId: {
						$convert: { input: '$recordingId', to: 'objectId', onError: null, onNull: null }
					}
				}
			},
			{
				$lookup: {
					from: 'recordings',
					localField: 'recordingObjectId',
					foreignField: '_id',
					pipeline: [{ $match: { published: true, status: 'ready' } }, { $project: { _id: 1 } }],
					as: 'owner'
				}
			},
			{
				$match: {
					$or: [
						{ recordingId: { $exists: false } },
						{ recordingId: null },
						{ 'owner.0': { $exists: true } }
					]
				}
			}
		);
		Object.assign(fields, {
			title: fallback('$filename'),
			date: '$publishedOn',
			url: fallback('$url'),
			parts: content || reader ? indexedParts(['$url'], f, reader) : []
		});
	} else {
		const documentUrls = {
			$cond: [
				{ $gt: [{ $size: fallback('$parts', []) }, 0] },
				fallback('$parts.url', []),
				{ $cond: [present('$pdf_url'), ['$pdf_url'], []] }
			]
		};
		Object.assign(fields, {
			date: '$release_date',
			category: fallback('$type'),
			url: fallback({ $arrayElemAt: [fallback('$parts.url', []), 0] }, fallback('$pdf_url')),
			parts: content || reader ? indexedParts(documentUrls, f, reader) : []
		});
	}
	stages.push({ $project: fields });
	stages.push({
		$set: { date: { $convert: { input: '$date', to: 'date', onError: null, onNull: null } } }
	});
	if (reader) return stages;
	stages.push({
		$set: {
			part:
				type === 'songs' ? firstPassage('$parts', f.q, f.match) : { $arrayElemAt: ['$parts', 0] }
		}
	});
	const matches: Document = {
		$or: [
			...['title', 'alternateTitle', 'author', 'category', 'description', 'code'].map((field) => ({
				[field]: { $regex: regex, $options: 'i' }
			})),
			{ 'part.text': { $exists: true, $ne: '' } }
		]
	};
	if (f.author) matches.author = { $regex: buildFuzzySearchPattern(f.author), $options: 'i' };
	if (f.category)
		matches.category = { $regex: `^${buildFuzzySearchPattern(f.category)}$`, $options: 'i' };
	if (f.language) matches.languages = f.language;
	if (f.from || f.to)
		matches.date = {
			...(f.from ? { $gte: new Date(f.from) } : {}),
			...(f.to ? { $lt: new Date(Date.parse(f.to) + 86400000) } : {})
		};
	stages.push(
		{ $match: matches },
		{
			$set: {
				score: { $cond: [{ $regexMatch: { input: '$title', regex, options: 'i' } }, 2, 1] }
			}
		},
		{ $project: { parts: 0 } }
	);
	return stages;
}

export function toLibraryResult(
	row: Document,
	query: string,
	mode: PassageMode = 'phrase',
	language = ''
): LibraryResult {
	const type = row.type as LibraryType;
	let href =
		type === 'sermons'
			? `/predications/${buildSermonSlug(row)}`
			: type === 'songs'
				? `/musique?play=${encodeURIComponent(row.id)}`
				: type === 'recordings'
					? `/live/rediffusions/${encodeURIComponent(row.id)}`
					: publicAssetUrl(row.url);
	let startMs = row.part?.startMs;
	if (type === 'songs')
		startMs = row.timeline?.find((timing: Document) => timing.line_id === row.part?.id)?.start_ms;
	const startSec =
		row.canSeekPart !== false && typeof startMs === 'number' && Number.isFinite(startMs)
			? Math.max(0, (startMs + (row.offsetMs ?? 0)) / 1000)
			: null;
	const pdfPage = Number.isInteger(row.part?.page) && row.part.page > 0 ? row.part.page : null;
	const pdfUrl = publicAssetUrl(row.part?.url || row.url);
	const pageHref = pdfPage && pdfUrl ? `${pdfUrl.split('#')[0]}#page=${pdfPage}` : '';
	if (pageHref && (type === 'documents' || type === 'transcriptions')) href = pageHref;
	const sourceHref = href;
	if (row.part?.text && /^[a-f\d]{24}$/i.test(row.id)) {
		const params = new URLSearchParams({ q: query });
		if (row.part.url) params.set('asset', row.part.url);
		if (language) params.set('language', language);
		if (mode === 'words') params.set('match', mode);
		href = `/lecture/${type}/${row.id}?${params}`;
	}
	return {
		id: row.id,
		type,
		title: row.title || row.id,
		author: row.author,
		category: row.category,
		languages: row.languages,
		date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : '',
		href,
		sourceHref,
		pageHref,
		code: row.date_code || row.code || '',
		audioUrl: publicAssetUrl(row.audioUrl),
		startSec,
		page: pdfPage,
		snippet: searchSnippet(
			row.part?.text || row.description || row.alternateTitle || row.title,
			query,
			mode
		)
	};
}

export async function searchLibrary(
	filters: LibraryFilters,
	database?: Db
): Promise<LibraryResponse> {
	if (filters.q.length < 2) return { results: [], total: 0, page: filters.page, pages: 0 };
	const db = database ?? (await getDb());
	const types = filters.type ? [filters.type] : [...libraryTypes];
	const sources = types.flatMap((type) => [
		{ type, content: false },
		...(type !== 'songs' && libraryTextTerm(filters.q) ? [{ type, content: true }] : [])
	]);
	const [first, ...rest] = sources;
	// Keep small metadata/lyric substring searches separate from indexed file
	// searches. Never put $text in an $or with an unindexed regex predicate.
	const [result] = await db
		.collection(libraryCollections[first.type])
		.aggregate(
			[
				...librarySourcePipeline(first.type, filters, first.content),
				...rest.map(({ type, content }) => ({
					$unionWith: {
						coll: libraryCollections[type],
						pipeline: librarySourcePipeline(type, filters, content)
					}
				})),
				// A title and a PDF passage may both match. Return/count the source once,
				// retaining the matching passage regardless of branch order.
				{
					$group: {
						_id: { type: '$type', id: '$id' },
						row: { $first: '$$ROOT' },
						part: { $mergeObjects: '$part' }
					}
				},
				{ $replaceWith: { $mergeObjects: ['$row', { part: '$part' }] } },
				{
					$facet: {
						items: [
							{ $sort: { score: -1, date: -1, type: 1, id: 1 } },
							{ $skip: (filters.page - 1) * SEARCH_PAGE_SIZE },
							{ $limit: SEARCH_PAGE_SIZE }
						],
						count: [{ $count: 'total' }]
					}
				}
			],
			// A complete cross-library count can exceed five seconds on a cold/shared
			// cluster. Keep it bounded, but leave headroom after candidate pruning.
			{ maxTimeMS: 10000, allowDiskUse: true }
		)
		.toArray();
	const total = result?.count[0]?.total ?? 0;
	return {
		results: (result?.items ?? []).map((row: Document) =>
			toLibraryResult(row, filters.q, filters.match, filters.language)
		),
		total,
		page: filters.page,
		pages: Math.min(1000, Math.ceil(total / SEARCH_PAGE_SIZE))
	};
}
