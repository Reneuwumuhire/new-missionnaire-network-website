import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import { getDb } from '../../db/mongo';
import {
	extractLyricsFromUrl,
	loadLyricsReviewRows,
	type LyricSection,
	type LyricSourceLine,
	type LyricsReviewRow
} from './lyricsReview';

export type LyricsLineKind = 'heading' | 'line';

export type LyricsLine = {
	id: string;
	kind: LyricsLineKind;
	order: number;
	role?: string;
	section_label: string;
	section_title: string;
	text: string;
	verse_number?: number | null;
};

export type LyricsTiming = {
	line_id: string;
	start_ms: number;
};

const LYRICS_COLLECTION = 'music_lyrics';

type SyncResult = {
	audioId: string;
	created: boolean;
	lineCount: number;
	timableLineCount: number;
};

export async function syncLyricsForAudioId(audioId: string, syncedBy: string) {
	const result = await syncLyricsForAudioIds([audioId], syncedBy);
	return result[0];
}

export async function syncLyricsForAudioIds(audioIds: string[], syncedBy: string) {
	const uniqueAudioIds = [...new Set(audioIds.map((id) => id.trim()).filter(Boolean))];
	if (uniqueAudioIds.length === 0) {
		throw new Error('audioId is required');
	}

	const { rows } = await loadLyricsReviewRows();
	const rowByAudioId = new Map(rows.map((row) => [row.audio_id, row]));
	const results: SyncResult[] = [];

	for (const audioId of uniqueAudioIds) {
		const row = rowByAudioId.get(audioId);
		if (!row) {
			throw new Error(`No lyrics match row found for audio ${audioId}`);
		}
		results.push(await syncLyricsFromReviewRow(row, syncedBy));
	}

	return results;
}

export async function publishManualLyricsForAudio(options: {
	audioId: string;
	lyricsText: string;
	sourceBook?: string;
	sourceNumber?: string;
	sourceTitle?: string;
	sourceUrl?: string;
	title?: string;
	updatedBy: string;
}) {
	const audioId = options.audioId.trim();
	if (!audioId) {
		throw new Error('audioId is required');
	}

	const audio = await findMusicAudio(audioId);
	if (!audio) {
		throw new Error('Audio not found');
	}

	const sections = createManualLyricSections(options.lyricsText, {
		sourceNumber: options.sourceNumber,
		title: options.sourceTitle || options.title || String(audio.title ?? '')
	});
	const lines = flattenLyricSections(sections);
	const timableLineCount = lines.filter((line) => line.kind === 'line').length;
	if (timableLineCount === 0) {
		throw new Error('Add at least one lyric line before publishing');
	}

	const row: LyricsReviewRow = {
		audio_id: audioId,
		audio_artist: String(audio.artist ?? ''),
		audio_book: String(audio.book ?? ''),
		audio_book_full_name: String(audio.book_full_name ?? ''),
		audio_category: String(audio.category ?? ''),
		audio_duration_seconds: String(audio.duration ?? ''),
		audio_number: String(audio.number ?? ''),
		audio_s3_key: String(audio.s3_key ?? ''),
		audio_title: String(audio.title ?? options.title ?? ''),
		audio_url: String(audio.s3_url ?? ''),
		audio_version: '',
		source_book: options.sourceBook?.trim() || String(audio.book_full_name ?? audio.book ?? ''),
		source_number: options.sourceNumber?.trim() || String(audio.number ?? ''),
		source_title: options.sourceTitle?.trim() || options.title?.trim() || String(audio.title ?? ''),
		source_url: options.sourceUrl?.trim() || ''
	};

	const result = await upsertLyricsDocument({
		audio,
		lines,
		row,
		sections,
		syncedBy: options.updatedBy,
		title: options.title?.trim() || row.source_title
	});

	return {
		...result,
		lyrics: (await getLyricsTimelineDetail(audioId)).lyrics
	};
}

export async function getLyricsTimelineDetail(audioId: string) {
	if (!audioId.trim()) {
		throw new Error('audioId is required');
	}

	const db = await getDb();
	const [audio, lyrics] = await Promise.all([
		findMusicAudio(audioId),
		db.collection(LYRICS_COLLECTION).findOne({ audio_id: audioId })
	]);
	const row = await findReviewRow(audioId);

	return {
		audio: audio
			? serializeAudio(audio)
			: row
				? {
						_id: row.audio_id,
						artist: row.audio_artist,
						book: row.audio_book,
						book_full_name: row.audio_book_full_name,
						duration: numberOrNull(row.audio_duration_seconds),
						number: numberOrNull(row.audio_number),
						s3_url: row.audio_url,
						title: row.audio_title
					}
				: null,
		lyrics: lyrics ? serializeLyricsDocument(lyrics) : null,
		reviewRow: row
	};
}

export async function saveLyricsTimeline(options: {
	audioId: string;
	status: 'draft' | 'published';
	timings: LyricsTiming[];
	updatedBy: string;
}) {
	const audioId = options.audioId.trim();
	if (!audioId) {
		throw new Error('audioId is required');
	}

	const db = await getDb();
	const lyrics = await db.collection(LYRICS_COLLECTION).findOne({ audio_id: audioId });
	if (!lyrics) {
		throw new Error('Sync lyrics before creating a timeline');
	}

	const audio = await findMusicAudio(audioId);
	const normalizedTimings = normalizeTimings(
		options.timings,
		Array.isArray(lyrics.lines) ? (lyrics.lines as LyricsLine[]) : [],
		options.status,
		audio?.duration
	);
	const now = new Date();
	const set: Record<string, unknown> = {
		timeline_draft: normalizedTimings,
		timeline_status: 'draft',
		timeline_updated_at: now,
		timeline_updated_by: options.updatedBy
	};

	if (options.status === 'published') {
		set.timeline_published = normalizedTimings;
		set.timeline_status = 'published';
		set.timeline_published_at = now;
		set.timeline_published_by = options.updatedBy;
	}

	await db.collection(LYRICS_COLLECTION).updateOne({ audio_id: audioId }, { $set: set });

	return getLyricsTimelineDetail(audioId);
}

export async function clearLyricsTimeline(options: { audioId: string; updatedBy: string }) {
	const audioId = options.audioId.trim();
	if (!audioId) {
		throw new Error('audioId is required');
	}

	const db = await getDb();
	const lyrics = await db.collection(LYRICS_COLLECTION).findOne({ audio_id: audioId });
	if (!lyrics) {
		throw new Error('Sync lyrics before clearing timing');
	}

	const now = new Date();
	await db.collection(LYRICS_COLLECTION).updateOne(
		{ audio_id: audioId },
		{
			$set: {
				timeline_draft: [],
				timeline_published: [],
				timeline_status: '',
				timeline_updated_at: now,
				timeline_updated_by: options.updatedBy,
				timeline_cleared_at: now,
				timeline_cleared_by: options.updatedBy,
				updated_at: now
			},
			$unset: {
				timeline_published_at: '',
				timeline_published_by: ''
			}
		}
	);

	return getLyricsTimelineDetail(audioId);
}

export async function splitLyricsLine(options: {
	audioId: string;
	lineId: string;
	parts: string[];
	updatedBy: string;
}) {
	const audioId = options.audioId.trim();
	const lineId = options.lineId.trim();
	if (!audioId) {
		throw new Error('audioId is required');
	}
	if (!lineId) {
		throw new Error('lineId is required');
	}

	const parts = options.parts.map((part) => normalizeLyricPart(part)).filter(Boolean);
	if (parts.length < 2) {
		throw new Error('Split a line into at least two parts');
	}

	const db = await getDb();
	const lyrics = await db.collection(LYRICS_COLLECTION).findOne({ audio_id: audioId });
	if (!lyrics) {
		throw new Error('Sync lyrics before editing line breaks');
	}

	const lines = Array.isArray(lyrics.lines) ? (lyrics.lines as LyricsLine[]) : [];
	const targetIndex = lines.findIndex((line) => line.id === lineId && line.kind === 'line');
	if (targetIndex < 0) {
		throw new Error('Lyric line not found');
	}

	const target = lines[targetIndex];
	const existingIds = new Set(lines.map((line) => line.id));
	const splitLines = parts.map((text, index) => ({
		...target,
		id: index === 0 ? target.id : createSplitLineId(target.id, index, existingIds),
		text,
		verse_number: index === 0 ? (target.verse_number ?? null) : null
	}));
	const nextLines = renumberLines([
		...lines.slice(0, targetIndex),
		...splitLines,
		...lines.slice(targetIndex + 1)
	]);
	const validLineIds = new Set(
		nextLines.filter((line) => line.kind === 'line').map((line) => line.id)
	);
	const draftTimings = filterTimings(
		Array.isArray(lyrics.timeline_draft) ? (lyrics.timeline_draft as LyricsTiming[]) : [],
		validLineIds
	);
	const publishedTimings = filterTimings(
		Array.isArray(lyrics.timeline_published) ? (lyrics.timeline_published as LyricsTiming[]) : [],
		validLineIds
	);
	const nextTimelineStatus =
		publishedTimings.length > 0 ? 'draft' : String(lyrics.timeline_status ?? '');
	const now = new Date();

	await db.collection(LYRICS_COLLECTION).updateOne(
		{ audio_id: audioId },
		{
			$set: {
				lines: nextLines,
				lyrics_hash: hashLyrics(nextLines),
				timeline_draft: draftTimings.length > 0 ? draftTimings : publishedTimings,
				timeline_published: [],
				timeline_status: nextTimelineStatus === 'published' ? 'draft' : nextTimelineStatus,
				line_breaks_updated_at: now,
				line_breaks_updated_by: options.updatedBy,
				timeline_updated_at: now,
				timeline_updated_by: options.updatedBy,
				updated_at: now
			}
		}
	);

	return getLyricsTimelineDetail(audioId);
}

export async function resetLyricsLineBreaks(options: { audioId: string; updatedBy: string }) {
	const audioId = options.audioId.trim();
	if (!audioId) {
		throw new Error('audioId is required');
	}

	const db = await getDb();
	const lyrics = await db.collection(LYRICS_COLLECTION).findOne({ audio_id: audioId });
	if (!lyrics) {
		throw new Error('Sync lyrics before resetting line breaks');
	}

	const sections = Array.isArray(lyrics.sections) ? (lyrics.sections as LyricSection[]) : [];
	if (sections.length === 0) {
		throw new Error('Original source line breaks are not available for this lyric');
	}

	const defaultLines = flattenLyricSections(sections);
	const currentLines = Array.isArray(lyrics.lines) ? (lyrics.lines as LyricsLine[]) : [];
	const defaultHash = hashLyrics(defaultLines);
	if (hashLyrics(currentLines) === defaultHash) {
		return getLyricsTimelineDetail(audioId);
	}

	const validLineIds = new Set(
		defaultLines.filter((line) => line.kind === 'line').map((line) => line.id)
	);
	const draftTimings = filterTimings(
		Array.isArray(lyrics.timeline_draft) ? (lyrics.timeline_draft as LyricsTiming[]) : [],
		validLineIds
	);
	const publishedTimings = filterTimings(
		Array.isArray(lyrics.timeline_published) ? (lyrics.timeline_published as LyricsTiming[]) : [],
		validLineIds
	);
	const nextDraft = draftTimings.length > 0 ? draftTimings : publishedTimings;
	const now = new Date();

	await db.collection(LYRICS_COLLECTION).updateOne(
		{ audio_id: audioId },
		{
			$set: {
				lines: defaultLines,
				lyrics_hash: defaultHash,
				timeline_draft: nextDraft,
				timeline_published: [],
				timeline_status: nextDraft.length > 0 ? 'draft' : '',
				line_breaks_updated_at: now,
				line_breaks_updated_by: options.updatedBy,
				line_breaks_reset_at: now,
				line_breaks_reset_by: options.updatedBy,
				timeline_updated_at: now,
				timeline_updated_by: options.updatedBy,
				updated_at: now
			}
		}
	);

	return getLyricsTimelineDetail(audioId);
}

async function syncLyricsFromReviewRow(row: LyricsReviewRow, syncedBy: string) {
	if (row.review_status !== 'ready_for_sync' && row.review_status !== 'approved') {
		throw new Error('Approve the match before publishing lyrics');
	}
	if (!row.source_url) {
		throw new Error('This match does not have a source URL');
	}

	const audio = await findMusicAudio(row.audio_id);
	const extracted = await extractLyricsFromUrl(row.source_url, {
		audioTitle: row.audio_title,
		versionLabel: row.audio_version
	});
	const lines = flattenLyricSections(extracted.sections);
	return upsertLyricsDocument({
		audio,
		lines,
		row,
		sections: extracted.sections,
		syncedBy,
		title: extracted.title || row.source_title
	});
}

async function upsertLyricsDocument(options: {
	audio: Record<string, unknown> | null;
	lines: LyricsLine[];
	row: LyricsReviewRow;
	sections: LyricSection[];
	syncedBy: string;
	title: string;
}) {
	const timableLineCount = options.lines.filter((line) => line.kind === 'line').length;
	if (timableLineCount === 0) {
		throw new Error('No lyric lines were found');
	}

	const db = await getDb();
	const existing = await db
		.collection(LYRICS_COLLECTION)
		.findOne({ audio_id: options.row.audio_id });
	const lyricsHash = hashLyrics(options.lines);
	const resetTimeline = existing?.lyrics_hash && existing.lyrics_hash !== lyricsHash;
	const now = new Date();

	const update: Record<string, unknown> = {
		audio_id: options.row.audio_id,
		audio_title: options.row.audio_title,
		audio_artist: options.row.audio_artist,
		audio_book: options.row.audio_book,
		audio_book_full_name: options.row.audio_book_full_name,
		audio_category: options.row.audio_category,
		audio_number: numberOrNull(options.row.audio_number),
		audio_version: options.row.audio_version,
		audio_duration_seconds: numberOrNull(options.row.audio_duration_seconds),
		audio_s3_key: options.row.audio_s3_key,
		audio_url: options.row.audio_url || String(options.audio?.s3_url ?? ''),
		lyrics_status: 'published',
		source_book: options.row.source_book,
		source_number: options.row.source_number,
		source_title: options.row.source_title,
		source_url: options.row.source_url,
		title: options.title,
		sections: options.sections,
		lines: options.lines,
		lyrics_hash: lyricsHash,
		synced_at: now,
		synced_by: options.syncedBy,
		updated_at: now
	};

	if (options.audio?._id) {
		update.audio_object_id = options.audio._id;
	}

	if (resetTimeline) {
		update.timeline_draft = [];
		update.timeline_published = [];
		update.timeline_status = '';
		update.timeline_updated_at = now;
		update.timeline_updated_by = options.syncedBy;
	}

	const setOnInsert: Record<string, unknown> = {
		created_at: now,
		created_by: options.syncedBy
	};

	if (!resetTimeline) {
		setOnInsert.timeline_draft = [];
		setOnInsert.timeline_published = [];
		setOnInsert.timeline_status = '';
	}

	const result = await db.collection(LYRICS_COLLECTION).updateOne(
		{ audio_id: options.row.audio_id },
		{
			$set: update,
			$setOnInsert: setOnInsert
		},
		{ upsert: true }
	);

	return {
		audioId: options.row.audio_id,
		created: Boolean(result.upsertedId),
		lineCount: options.lines.length,
		timableLineCount
	};
}

function createManualLyricSections(
	lyricsText: string,
	options: { sourceNumber?: string; title?: string }
): LyricSection[] {
	const blocks = lyricsText
		.replace(/\r/g, '')
		.split(/\n\s*\n/g)
		.map((block) => block.trim())
		.filter(Boolean);

	if (blocks.length === 0) {
		throw new Error('Lyrics text is required');
	}

	const sections: LyricSection[] = [];
	let pendingHeading: { label: string; role: LyricSourceLine['role'] } | null = null;

	blocks.forEach((block) => {
		const rawLines = block
			.split('\n')
			.map((line) => normalizeManualLine(line))
			.filter(Boolean);
		const heading = rawLines[0] ?? '';
		const headingRole = getManualHeadingRole(heading);
		if (rawLines.length === 1 && headingRole !== null) {
			pendingHeading = { label: heading, role: headingRole };
			return;
		}

		const hasStandaloneHeading = rawLines.length > 1 && headingRole !== null;
		const lyricLines = hasStandaloneHeading ? rawLines.slice(1) : rawLines;
		const role = hasStandaloneHeading ? headingRole : pendingHeading?.role;
		const headingLabel = hasStandaloneHeading ? heading : pendingHeading?.label;
		const sectionIndex = sections.length;

		sections.push({
			label:
				sectionIndex === 0 && !hasStandaloneHeading && !pendingHeading
					? String(options.sourceNumber ?? '').trim()
					: headingLabel
						? headingLabel
						: '',
			title:
				sectionIndex === 0 && !hasStandaloneHeading && !pendingHeading
					? String(options.title ?? '').trim()
					: '',
			lines: lyricLines.map((line) => ({
				role: role ?? detectManualLineRole(line),
				text: line
			}))
		});
		pendingHeading = null;
	});

	return sections;
}

function normalizeManualLine(value: string) {
	return value.replace(/\s+/g, ' ').trim();
}

function getManualHeadingRole(value: string): LyricSourceLine['role'] | null {
	if (/^(refrain|chorus|choeur|chœur|coro|korasi)\s*:?\s*$/i.test(value)) return 'refrain';
	if (/^(couplet|verse)\s*\d*\s*:?\s*$/i.test(value)) return 'verse';
	return null;
}

function detectManualLineRole(value: string): LyricSourceLine['role'] {
	return /\b(refrain|chorus|choeur|chœur|coro|korasi)\b/i.test(value) ? 'refrain' : 'line';
}

function flattenLyricSections(sections: LyricSection[]) {
	const lines: LyricsLine[] = [];
	let order = 0;

	sections.forEach((section, sectionIndex) => {
		const heading = [section.label, section.title].filter(Boolean).join(' - ');
		if (heading) {
			lines.push({
				id: `s${sectionIndex}-h`,
				kind: 'heading',
				order,
				section_label: section.label,
				section_title: section.title,
				text: heading
			});
			order += 1;
		}

		section.lines.forEach((sourceLine, lineIndex) => {
			const line = normalizeSourceLine(sourceLine);
			lines.push({
				id: `s${sectionIndex}-l${lineIndex}`,
				kind: 'line',
				order,
				role: line.role,
				section_label: section.label,
				section_title: section.title,
				text: line.text,
				verse_number: line.verseNumber
			});
			order += 1;
		});
	});

	return lines;
}

function normalizeSourceLine(sourceLine: LyricSourceLine | string) {
	if (typeof sourceLine === 'string') {
		const parsed = parseVersePrefix(sourceLine);
		return {
			role: parsed.verseNumber !== null ? 'verse' : 'line',
			text: parsed.text,
			verseNumber: parsed.verseNumber
		};
	}

	const parsed = parseVersePrefix(sourceLine.text);
	const sourceVerseNumber = Number(sourceLine.verse_number);
	const verseNumber =
		Number.isFinite(sourceVerseNumber) && sourceVerseNumber > 0
			? sourceVerseNumber
			: parsed.verseNumber;

	return {
		role: sourceLine.role ?? (verseNumber !== null ? 'verse' : 'line'),
		text: parsed.text,
		verseNumber
	};
}

function parseVersePrefix(text: string) {
	const match = text.match(/^\s*(\d{1,3})\s*[.)]\s+(.+)$/);
	if (!match) return { text, verseNumber: null };
	return {
		text: match[2].trim(),
		verseNumber: Number(match[1])
	};
}

function normalizeTimings(
	timings: LyricsTiming[],
	lines: LyricsLine[],
	status: 'draft' | 'published',
	durationSeconds?: unknown
) {
	const timableLines = lines.filter((line) => line.kind === 'line');
	const validLineIds = new Set(timableLines.map((line) => line.id));
	const timingMap = new Map<string, number>();
	const durationMs = Number(durationSeconds) > 0 ? Number(durationSeconds) * 1000 : null;

	for (const timing of timings) {
		const lineId = String(timing.line_id ?? '').trim();
		if (!validLineIds.has(lineId)) continue;

		const startMs = Math.round(Number(timing.start_ms));
		if (!Number.isFinite(startMs) || startMs < 0) {
			throw new Error('Timeline timestamps must be positive numbers');
		}
		if (durationMs !== null && startMs > durationMs + 1000) {
			throw new Error('Timeline timestamp is longer than the audio duration');
		}
		timingMap.set(lineId, startMs);
	}

	if (status === 'published' && timingMap.size !== timableLines.length) {
		throw new Error('Every lyric line needs a timestamp before publishing');
	}

	let previous = -1;
	const normalized: LyricsTiming[] = [];
	for (const line of timableLines) {
		const startMs = timingMap.get(line.id);
		if (startMs === undefined) continue;
		if (startMs < previous) {
			throw new Error('Timeline timestamps must follow the lyric order');
		}
		previous = startMs;
		normalized.push({
			line_id: line.id,
			start_ms: startMs
		});
	}

	return normalized;
}

function normalizeLyricPart(value: string) {
	return value.replace(/\s+/g, ' ').trim();
}

function createSplitLineId(baseId: string, index: number, existingIds: Set<string>) {
	let suffix = index;
	let id = `${baseId}-p${suffix}`;
	while (existingIds.has(id)) {
		suffix += 1;
		id = `${baseId}-p${suffix}`;
	}
	existingIds.add(id);
	return id;
}

function renumberLines(lines: LyricsLine[]) {
	return lines.map((line, order) => ({
		...line,
		order
	}));
}

function filterTimings(timings: LyricsTiming[], validLineIds: Set<string>) {
	return timings
		.filter((timing) => validLineIds.has(String(timing.line_id)))
		.map((timing) => ({
			line_id: String(timing.line_id),
			start_ms: Math.max(0, Math.round(Number(timing.start_ms)))
		}))
		.filter((timing) => Number.isFinite(timing.start_ms));
}

async function findReviewRow(audioId: string) {
	const { rows } = await loadLyricsReviewRows();
	return rows.find((row) => row.audio_id === audioId) ?? null;
}

async function findMusicAudio(audioId: string) {
	if (!ObjectId.isValid(audioId)) return null;
	const db = await getDb();
	return db.collection('music_audio').findOne({ _id: new ObjectId(audioId) });
}

function serializeAudio(audio: Record<string, unknown>) {
	return {
		_id: String(audio._id ?? ''),
		artist: String(audio.artist ?? ''),
		book: String(audio.book ?? ''),
		book_full_name: String(audio.book_full_name ?? ''),
		duration: numberOrNull(audio.duration),
		number: numberOrNull(audio.number),
		s3_url: String(audio.s3_url ?? ''),
		title: String(audio.title ?? '')
	};
}

function serializeLyricsDocument(doc: Record<string, unknown>) {
	return {
		_id: String(doc._id ?? ''),
		audio_id: String(doc.audio_id ?? ''),
		audio_url: String(doc.audio_url ?? ''),
		lyrics_status: String(doc.lyrics_status ?? ''),
		source_book: String(doc.source_book ?? ''),
		source_number: String(doc.source_number ?? ''),
		source_title: String(doc.source_title ?? ''),
		source_url: String(doc.source_url ?? ''),
		title: String(doc.title ?? ''),
		lines: Array.isArray(doc.lines) ? doc.lines : [],
		timeline_draft: Array.isArray(doc.timeline_draft) ? doc.timeline_draft : [],
		timeline_published: Array.isArray(doc.timeline_published) ? doc.timeline_published : [],
		timeline_status: String(doc.timeline_status ?? ''),
		synced_at: dateToString(doc.synced_at),
		synced_by: String(doc.synced_by ?? ''),
		timeline_updated_at: dateToString(doc.timeline_updated_at),
		timeline_published_at: dateToString(doc.timeline_published_at)
	};
}

function hashLyrics(lines: LyricsLine[]) {
	return crypto
		.createHash('sha256')
		.update(lines.map((line) => `${line.kind}:${line.text}`).join('\n'))
		.digest('hex');
}

function dateToString(value: unknown) {
	if (!value) return '';
	if (value instanceof Date) return value.toISOString();
	return String(value);
}

function numberOrNull(value: unknown) {
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}
