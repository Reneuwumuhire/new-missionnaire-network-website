import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { getDb } from '../../db/mongo';

export type LyricsReviewRow = Record<string, string>;

type ReviewUpdate = {
	audioId: string;
	reviewStatus: ReviewStatus;
	reviewedBy?: string;
	reviewNotes?: string;
};

type ReviewStatus = '' | 'approved' | 'rejected' | 'ready_for_sync';

const REVIEW_COLLECTION = 'lyrics_match_reviews';
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
	const reviewMap = await readReviewMap(csvRows.map((row) => row.audio_id).filter(Boolean));
	const rows = csvRows.map((row) => mergeReview(row, reviewMap.get(row.audio_id)));

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

	if (!REVIEW_STATUSES.has(update.reviewStatus)) {
		throw new Error('Invalid reviewStatus');
	}

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

export async function extractLyricsFromUrl(sourceUrl: string) {
	const url = new URL(sourceUrl);
	if (url.hostname !== 'indirimbo-zikundwa.bi') {
		throw new Error('Unsupported lyrics source');
	}

	const response = await fetch(url, {
		headers: {
			accept: 'text/html,application/xhtml+xml',
			'user-agent': 'MissionnaireNetworkLyricsReview/0.1 (+https://missionnaire.net)'
		}
	});

	if (!response.ok) {
		throw new Error(`Could not fetch lyrics page (${response.status})`);
	}

	const html = await response.text();
	const title = extractFirstText(html, /<div class="s">\s*<div[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
	const lines = extractLyricLines(html);

	return {
		lines,
		title,
		url: sourceUrl
	};
}

async function readLyricsCsvRows() {
	const csvPath = getCsvPath();
	const text = await fs.readFile(csvPath, 'utf8');
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

function mergeReview(row: LyricsReviewRow, review?: LyricsReviewRow) {
	if (!review) return row;

	return {
		...row,
		review_status: review.review_status ?? row.review_status,
		reviewed_by: review.reviewed_by ?? row.reviewed_by,
		review_notes: review.review_notes ?? row.review_notes,
		reviewed_at: review.reviewed_at ?? row.reviewed_at
	};
}

async function tryUpdateCsvReview(audioId: string, review: LyricsReviewRow) {
	try {
		const csvPath = getCsvPath();
		const text = await fs.readFile(csvPath, 'utf8');
		const parsed = parseCsv(text);
		const headers = mergeHeaders(parsed.headers, BASE_HEADERS);
		const rows = parsed.rows.map((row) => normalizeRow(row, headers));
		const target = rows.find((row) => row.audio_id === audioId);

		if (!target) return false;

		for (const column of REVIEW_COLUMNS) {
			target[column] = review[column] ?? '';
		}

		rows.sort(compareRowsForReview);
		await fs.writeFile(csvPath, stringifyCsv(rows, headers));
		return true;
	} catch (error) {
		console.warn('[LyricsReview] Could not update CSV file:', error);
		return false;
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

function extractLyricLines(html: string) {
	const lines: string[] = [];
	const contentStart = html.indexOf('<div class="s">');
	const content = contentStart >= 0 ? html.slice(contentStart) : html;
	const lineRegex = /<(?:li|div)\b[^>]*class="(?:zoli1|pc)"[^>]*>([\s\S]*?)<\/(?:li|div)>/gi;

	let match;
	while ((match = lineRegex.exec(content)) !== null) {
		const text = htmlToText(match[1]);
		if (!text || /^\*+$/.test(text)) continue;
		lines.push(text);
	}

	return lines;
}

function extractFirstText(html: string, regex: RegExp) {
	const match = regex.exec(html);
	return match ? htmlToText(match[1]) : '';
}

function htmlToText(html: string) {
	return decodeHtmlEntities(
		html
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<[^>]+>/g, '')
			.replace(/[ \t]+\n/g, '\n')
			.replace(/\n{3,}/g, '\n\n')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

function decodeHtmlEntities(text: string) {
	const named: Record<string, string> = {
		amp: '&',
		apos: "'",
		gt: '>',
		lt: '<',
		nbsp: ' ',
		quot: '"'
	};

	return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => {
		const lower = entity.toLowerCase();
		if (lower.startsWith('#x')) {
			return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
		}
		if (lower.startsWith('#')) {
			return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
		}
		return named[lower] ?? `&${entity};`;
	});
}
