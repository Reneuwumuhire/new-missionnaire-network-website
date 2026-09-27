import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { getDb } from '../../db/mongo';
import { loadIndirimboSongs } from './indirimboSource';
// Build-time CSV fallback. Vercel serverless functions can't read arbitrary
// repo files at runtime (process.cwd() is the read-only Lambda bundle), so we
// inline the CSV as a string. In dev, fs.readFile takes precedence so script
// regenerations are picked up without rebuilding. Bundle cost: ~650 KB for
// any function that imports lyricsReview.
import bundledCsv from '../../../lyrics-matches.csv?raw';

export type LyricsReviewRow = Record<string, string>;

type ReviewUpdate = {
	audioId: string;
	reviewStatus: ReviewStatus;
	reviewedBy?: string;
	reviewNotes?: string;
};

type BulkReviewUpdate = {
	audioIds: string[];
	reviewStatus: ReviewStatus;
	reviewedBy?: string;
	reviewNotes?: string;
};

export type ReviewStatus = '' | 'approved' | 'rejected' | 'ready_for_sync';

const REVIEW_COLLECTION = 'lyrics_match_reviews';
const PUBLISHED_LYRICS_COLLECTION = 'music_lyrics';
const DEFAULT_CSV_PATH = 'lyrics-matches.csv';
const REVIEW_STATUSES = new Set<ReviewStatus>(['', 'approved', 'rejected', 'ready_for_sync']);
const REVIEW_COLUMNS = ['review_status', 'reviewed_by', 'review_notes', 'reviewed_at'];

const BASE_HEADERS = [
	'review_status',
	'reviewed_by',
	'review_notes',
	'reviewed_at',
	'match_status',
	'audio_id',
	'audio_title',
	'audio_artist',
	'audio_book',
	'audio_book_full_name',
	'audio_category',
	'audio_number',
	'audio_version',
	'audio_duration_seconds',
	'audio_s3_key',
	'audio_url',
	'lyrics_text_id',
	'confidence',
	'reason',
	'source_book',
	'source_number',
	'source_title',
	'source_url'
];

export async function loadLyricsReviewRows() {
	const csvRows = await readLyricsCsvRows();
	const audioIds = csvRows.map((row) => row.audio_id).filter(Boolean);
	const [reviewMap, publishedLyricsMap] = await Promise.all([
		readReviewMap(audioIds),
		readPublishedLyricsMap(audioIds)
	]);
	const rows = csvRows.map((row) =>
		mergePublishedLyrics(
			mergeReview(row, reviewMap.get(row.audio_id)),
			publishedLyricsMap.get(row.audio_id)
		)
	);

	rows.sort(compareRowsForReview);

	return {
		rows,
		summary: summarizeLyricsReviewRows(rows),
		csvPath: getCsvPath()
	};
}

export async function saveLyricsReview(update: ReviewUpdate) {
	if (!update.audioId) {
		throw new Error('audioId is required');
	}

	validateReviewStatus(update.reviewStatus);

	const reviewedAt = update.reviewStatus ? new Date().toISOString() : '';
	const reviewFields = {
		audio_id: update.audioId,
		review_status: update.reviewStatus,
		reviewed_by: update.reviewedBy?.trim() ?? '',
		review_notes: update.reviewNotes?.trim() ?? '',
		reviewed_at: reviewedAt
	};
	const reviewDocument = {
		...reviewFields,
		updated_at: new Date()
	};

	const db = await getDb();
	await db
		.collection(REVIEW_COLLECTION)
		.updateOne({ audio_id: update.audioId }, { $set: reviewDocument }, { upsert: true });

	const savedToCsv = await tryUpdateCsvReview(update.audioId, reviewFields);
	const { rows, summary } = await loadLyricsReviewRows();
	const row = rows.find((item) => item.audio_id === update.audioId) ?? null;

	return {
		row,
		savedToCsv,
		summary
	};
}

export async function saveLyricsReviewBulk(update: BulkReviewUpdate) {
	const audioIds = [...new Set(update.audioIds.map((id) => id.trim()).filter(Boolean))];
	if (audioIds.length === 0) {
		throw new Error('audioIds are required');
	}

	validateReviewStatus(update.reviewStatus);

	const reviewedAt = update.reviewStatus ? new Date().toISOString() : '';
	const reviewUpdates = audioIds.map((audioId) => {
		const fields: LyricsReviewRow = {
			audio_id: audioId,
			review_status: update.reviewStatus,
			reviewed_by: update.reviewedBy?.trim() ?? '',
			reviewed_at: reviewedAt
		};

		if (update.reviewNotes !== undefined) {
			fields.review_notes = update.reviewNotes.trim();
		}

		return fields;
	});

	const db = await getDb();
	await db.collection(REVIEW_COLLECTION).bulkWrite(
		reviewUpdates.map((review) => ({
			updateOne: {
				filter: { audio_id: review.audio_id },
				update: {
					$set: {
						...review,
						updated_at: new Date()
					}
				},
				upsert: true
			}
		}))
	);

	const savedToCsv = await tryUpdateCsvReviews(reviewUpdates);
	const { rows, summary } = await loadLyricsReviewRows();
	const rowSet = new Set(audioIds);

	return {
		count: audioIds.length,
		rows: rows.filter((item) => rowSet.has(item.audio_id)),
		savedToCsv,
		summary
	};
}

export async function exportLyricsReviewCsv() {
	const { rows } = await loadLyricsReviewRows();
	return stringifyCsv(rows, BASE_HEADERS);
}

export function summarizeLyricsReviewRows(rows: LyricsReviewRow[]) {
	const summary = {
		total: rows.length,
		reviewed: 0,
		matched: 0,
		readyForSync: 0,
		approved: 0,
		rejected: 0,
		pending: 0,
		likely: 0,
		candidate: 0,
		needsReview: 0
	};

	for (const row of rows) {
		const reviewStatus = row.review_status;
		const matchStatus = row.match_status;

		if (reviewStatus) summary.reviewed += 1;
		else summary.pending += 1;

		if (reviewStatus === 'approved') summary.approved += 1;
		if (reviewStatus === 'rejected') summary.rejected += 1;
		if (reviewStatus === 'ready_for_sync') summary.readyForSync += 1;
		if (reviewStatus === 'approved' || reviewStatus === 'ready_for_sync') summary.matched += 1;

		if (matchStatus === 'likely') summary.likely += 1;
		if (matchStatus === 'candidate') summary.candidate += 1;
		if (matchStatus === 'needs_review') summary.needsReview += 1;
	}

	return summary;
}

export async function extractLyricsFromUrl(
	sourceUrl: string,
	options: { audioTitle?: string; versionLabel?: string } = {}
) {
	const songs = await loadIndirimboSongs(sourceUrl, options);
	const sections: LyricSection[] = songs.map((song) => {
		let verseNumber = 0;
		return {
			label: song.label,
			title: song.title,
			lines: song.stanzas
				.filter((stanza) => stanza.text?.trim())
				.map((stanza) => ({
					role: stanza.type === 'chorus' ? 'refrain' : 'verse',
					text: stanza.text.trim(),
					verse_number: stanza.type === 'verse' ? ++verseNumber : null
				}))
		};
	});
	const lines = sections.flatMap((section) => [
		formatSectionHeading(section),
		...section.lines.map((line) => getLyricSourceLineText(line))
	]);

	return {
		lines,
		sections,
		title: songs.map((song) => song.title).join(' / '),
		url: sourceUrl
	};
}

async function readCsvText(): Promise<string> {
	const csvPath = getCsvPath();
	try {
		return await fs.readFile(csvPath, 'utf8');
	} catch (err) {
		// On Vercel the file isn't on the function FS — fall back to the
		// build-time inlined CSV. Other I/O errors propagate.
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			return bundledCsv;
		}
		throw err;
	}
}

async function readLyricsCsvRows() {
	const text = await readCsvText();
	const { headers, rows } = parseCsv(text);
	const mergedHeaders = mergeHeaders(headers, BASE_HEADERS);

	return rows.map((row) => normalizeRow(row, mergedHeaders));
}

async function readReviewMap(audioIds: string[]) {
	const reviewMap = new Map<string, LyricsReviewRow>();
	if (audioIds.length === 0) return reviewMap;

	try {
		const db = await getDb();
		const reviews = await db
			.collection(REVIEW_COLLECTION)
			.find({ audio_id: { $in: audioIds } })
			.project({
				_id: 0,
				audio_id: 1,
				review_status: 1,
				reviewed_by: 1,
				review_notes: 1,
				reviewed_at: 1
			})
			.toArray();

		for (const review of reviews) {
			reviewMap.set(String(review.audio_id), stringifyRow(review as LyricsReviewRow));
		}
	} catch (error) {
		console.warn('[LyricsReview] Could not load Mongo review overlay:', error);
	}

	return reviewMap;
}

async function readPublishedLyricsMap(audioIds: string[]) {
	const lyricsMap = new Map<string, LyricsReviewRow>();
	if (audioIds.length === 0) return lyricsMap;

	try {
		const db = await getDb();
		const docs = await db
			.collection(PUBLISHED_LYRICS_COLLECTION)
			.find({ audio_id: { $in: audioIds } })
			.project({
				_id: 0,
				audio_id: 1,
				lyrics_status: 1,
				synced_at: 1,
				synced_by: 1,
				timeline_status: 1,
				timeline_draft: 1,
				timeline_published: 1,
				lines: 1
			})
			.toArray();

		for (const doc of docs) {
			const lines = Array.isArray(doc.lines) ? doc.lines : [];
			const timableLineCount = lines.filter((line) => line?.kind !== 'heading').length;
			const draft = Array.isArray(doc.timeline_draft) ? doc.timeline_draft : [];
			const published = Array.isArray(doc.timeline_published) ? doc.timeline_published : [];
			const timelineStatus =
				String(doc.timeline_status ?? '') ||
				(published.length > 0 ? 'published' : draft.length > 0 ? 'draft' : '');

			lyricsMap.set(String(doc.audio_id), {
				audio_id: String(doc.audio_id),
				lyrics_sync_status: String(doc.lyrics_status ?? 'published'),
				lyrics_synced_at: dateToString(doc.synced_at),
				lyrics_synced_by: String(doc.synced_by ?? ''),
				timeline_status: timelineStatus,
				timeline_line_count: String(timableLineCount),
				timeline_timed_line_count: String(
					timelineStatus === 'published' ? published.length : draft.length
				)
			});
		}
	} catch (error) {
		console.warn('[LyricsReview] Could not load published lyrics overlay:', error);
	}

	return lyricsMap;
}

function mergeReview(row: LyricsReviewRow, review?: LyricsReviewRow): LyricsReviewRow {
	if (!review) return row;

	return {
		...row,
		review_status: review.review_status ?? row.review_status,
		reviewed_by: review.reviewed_by ?? row.reviewed_by,
		review_notes: review.review_notes ?? row.review_notes,
		reviewed_at: review.reviewed_at ?? row.reviewed_at
	};
}

function mergePublishedLyrics(row: LyricsReviewRow, lyrics?: LyricsReviewRow): LyricsReviewRow {
	if (!lyrics) {
		return {
			...row,
			lyrics_sync_status: row.lyrics_sync_status ?? '',
			lyrics_synced_at: row.lyrics_synced_at ?? '',
			lyrics_synced_by: row.lyrics_synced_by ?? '',
			timeline_status: row.timeline_status ?? '',
			timeline_line_count: row.timeline_line_count ?? '',
			timeline_timed_line_count: row.timeline_timed_line_count ?? ''
		};
	}

	return {
		...row,
		lyrics_sync_status: lyrics.lyrics_sync_status ?? '',
		lyrics_synced_at: lyrics.lyrics_synced_at ?? '',
		lyrics_synced_by: lyrics.lyrics_synced_by ?? '',
		timeline_status: lyrics.timeline_status ?? '',
		timeline_line_count: lyrics.timeline_line_count ?? '',
		timeline_timed_line_count: lyrics.timeline_timed_line_count ?? ''
	};
}

function dateToString(value: unknown) {
	if (!value) return '';
	if (value instanceof Date) return value.toISOString();
	return String(value);
}

async function tryUpdateCsvReview(audioId: string, review: LyricsReviewRow) {
	return tryUpdateCsvReviews([{ ...review, audio_id: audioId }]);
}

async function tryUpdateCsvReviews(reviews: LyricsReviewRow[]) {
	try {
		const reviewMap = new Map(reviews.map((review) => [review.audio_id, review]));
		const csvPath = getCsvPath();
		// Read directly from disk here (no bundled fallback) — the goal is to
		// rewrite the on-disk CSV to mirror review state in dev. On serverless,
		// this throws ENOENT and the catch below logs + returns false, which
		// is the intended behavior (writes are read-only there anyway).
		const text = await fs.readFile(csvPath, 'utf8');
		const parsed = parseCsv(text);
		const headers = mergeHeaders(parsed.headers, BASE_HEADERS);
		const rows = parsed.rows.map((row) => normalizeRow(row, headers));
		let updatedCount = 0;

		for (const row of rows) {
			const review = reviewMap.get(row.audio_id);
			if (!review) continue;
			for (const column of REVIEW_COLUMNS) {
				if (review[column] !== undefined) {
					row[column] = review[column] ?? '';
				}
			}
			updatedCount += 1;
		}

		if (updatedCount === 0) return false;

		rows.sort(compareRowsForReview);
		await fs.writeFile(csvPath, stringifyCsv(rows, headers));
		return true;
	} catch (error) {
		console.warn('[LyricsReview] Could not update CSV file:', error);
		return false;
	}
}

function validateReviewStatus(reviewStatus: ReviewStatus) {
	if (!REVIEW_STATUSES.has(reviewStatus)) {
		throw new Error('Invalid reviewStatus');
	}
}

function getCsvPath() {
	const configured = env.LYRICS_MATCHES_CSV_PATH?.trim() || DEFAULT_CSV_PATH;
	return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

function normalizeRow(row: LyricsReviewRow, headers: string[]) {
	const normalized: LyricsReviewRow = {};

	for (const header of headers) {
		normalized[header] = row[header] ?? '';
	}

	for (const column of REVIEW_COLUMNS) {
		normalized[column] = normalized[column] ?? '';
	}

	return normalized;
}

function stringifyRow(row: LyricsReviewRow) {
	const stringified: LyricsReviewRow = {};
	for (const [key, value] of Object.entries(row)) {
		stringified[key] = String(value ?? '');
	}
	return stringified;
}

function mergeHeaders(currentHeaders: string[], preferredHeaders: string[]) {
	const headerSet = new Set([...preferredHeaders, ...currentHeaders]);
	return [...headerSet];
}

function compareRowsForReview(left: LyricsReviewRow, right: LyricsReviewRow) {
	const confidenceDelta = Number(right.confidence) - Number(left.confidence);
	if (confidenceDelta !== 0) return confidenceDelta;

	const statusDelta = statusRank(left.match_status) - statusRank(right.match_status);
	if (statusDelta !== 0) return statusDelta;

	return String(left.audio_title).localeCompare(String(right.audio_title), 'fr');
}

function statusRank(status: string) {
	switch (status) {
		case 'likely':
			return 0;
		case 'candidate':
			return 1;
		case 'needs_review':
			return 2;
		default:
			return 3;
	}
}

function parseCsv(text: string) {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let inQuotes = false;

	for (let i = 0; i < text.length; i += 1) {
		const char = text[i];
		const next = text[i + 1];

		if (inQuotes) {
			if (char === '"' && next === '"') {
				cell += '"';
				i += 1;
			} else if (char === '"') {
				inQuotes = false;
			} else {
				cell += char;
			}
			continue;
		}

		if (char === '"') {
			inQuotes = true;
		} else if (char === ',') {
			row.push(cell);
			cell = '';
		} else if (char === '\n') {
			row.push(cell);
			rows.push(row);
			row = [];
			cell = '';
		} else if (char !== '\r') {
			cell += char;
		}
	}

	if (cell || row.length > 0) {
		row.push(cell);
		rows.push(row);
	}

	const [headers = [], ...dataRows] = rows;
	return {
		headers,
		rows: dataRows
			.filter((cells) => cells.some((value) => value.trim()))
			.map((cells) =>
				Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']))
			)
	};
}

function stringifyCsv(rows: LyricsReviewRow[], headers: string[]) {
	const lines = [
		headers.join(','),
		...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))
	];

	return `${lines.join('\n')}\n`;
}

function csvCell(value: unknown) {
	const text = String(value ?? '');
	if (!/[",\r\n]/.test(text)) return text;
	return `"${text.replace(/"/g, '""')}"`;
}

export type LyricSection = {
	// Set only when the section came from a paragraph the user typed, so the
	// editor can rebuild the exact same paragraphs. Scraped sections omit it.
	block?: number;
	label: string;
	lines: LyricSourceLine[];
	title: string;
};

export type LyricSourceLine = {
	role?: 'line' | 'refrain' | 'verse';
	text: string;
	verse_number?: number | null;
};

function getLyricSourceLineText(line: LyricSourceLine | string) {
	return typeof line === 'string' ? line : line.text;
}

function formatSectionHeading(section: LyricSection) {
	return [section.label, section.title].filter(Boolean).join(' - ');
}
