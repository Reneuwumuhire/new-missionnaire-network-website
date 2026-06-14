import { ObjectId } from 'mongodb';
import { getDb } from '../../db/mongo';

// Indexes we want on the `recordings` collection. Created lazily on first
// query so we never ship a migration step; Mongo's createIndex is a no-op
// when the index already exists, so the cost is a single metadata round-trip
// on cold start.
let indexesEnsured: Promise<void> | null = null;
async function ensureIndexes(): Promise<void> {
	if (indexesEnsured !== null) return indexesEnsured;
	indexesEnsured = (async () => {
		try {
			const db = await getDb();
			await db
				.collection('recordings')
				.createIndex(
					{ published: 1, status: 1, started_at: -1 },
					{ name: 'pub_status_startedAt_desc' }
				);
		} catch (err) {
			// Retry next call: reset the latch so a transient failure doesn't
			// permanently disable indexes (e.g. if the DB is briefly unavailable
			// during the first request).
			indexesEnsured = null;
			console.error('[recordings] ensureIndexes failed', err);
		}
	})();
	return indexesEnsured;
}

export interface PublishedRecording {
	id: string;
	title: string;
	started_at: string; // ISO
	duration_sec: number | null;
	s3_url: string;
	size_bytes: number | null;
	thumbnail_url: string | null;
	description: string | null;
	/** YouTube video id (e.g. "MgoAxBWkG-s") when the import script matched
	 *  this recording to a video on our channel. */
	source_video_id: string | null;
	/** Preferred transcript PDF explicitly attached from admin. */
	transcript_pdf_id: string | null;
	/** Cumulative number of views. Stored on the doc and incremented by a
	 *  separate fire-and-forget endpoint, so reading it here costs nothing
	 *  extra — it rides along on the findOne the page already does. */
	view_count: number;
	/** Replay subtitles attached directly to this recording by an admin
	 *  (independent of the scheduled-live source). When set, they take
	 *  precedence over the scheduled-live anchor-derived subtitles. */
	subtitle_srt_url: string | null;
	subtitle_srt_s3_key: string | null;
	subtitle_filename: string | null;
	/** Milliseconds into the recording at which SRT 00:00 occurs (the sync
	 *  point). May be negative if the subtitles lead the audio. */
	subtitle_offset_into_recording_ms: number | null;
	/** Admin kill-switch: hide subtitles from listeners (e.g. while a bad SRT
	 *  is being fixed) without deleting the file. */
	subtitles_hidden: boolean;
	/** Optional French-language audio version. When set, the replay page offers a
	 *  language switch between the original capture (`s3_url`) and this one. */
	french_audio_url: string | null;
	french_audio_size_bytes: number | null;
	french_audio_duration_sec: number | null;
	/** Language code of the primary/original audio (e.g. 'rw' Kinyarwanda, 'sw'
	 *  Swahili, 'fr', 'en'). Drives the label of the original option in the
	 *  replay language switch. Defaults to Kinyarwanda for legacy rows. */
	original_audio_language: string;
}

interface RecordingRow {
	_id: { toString(): string };
	title: string;
	started_at: Date | string;
	duration_sec?: number | null;
	s3_url?: string | null;
	size_bytes?: number | null;
	thumbnail_url?: string | null;
	description?: string | null;
	source_video_id?: string | null;
	transcript_pdf_id?: string | null;
	view_count?: number | null;
	subtitle_srt_url?: string | null;
	subtitle_srt_s3_key?: string | null;
	subtitle_filename?: string | null;
	subtitle_offset_into_recording_ms?: number | null;
	subtitles_hidden?: boolean | null;
	french_audio_s3_url?: string | null;
	french_audio_size_bytes?: number | null;
	french_audio_duration_sec?: number | null;
	original_audio_language?: string | null;
}

function toPublic(doc: RecordingRow): PublishedRecording {
	return {
		id: doc._id.toString(),
		title: doc.title,
		started_at:
			doc.started_at instanceof Date ? doc.started_at.toISOString() : String(doc.started_at),
		duration_sec: doc.duration_sec ?? null,
		s3_url: doc.s3_url ?? '',
		size_bytes: doc.size_bytes ?? null,
		thumbnail_url: doc.thumbnail_url ?? null,
		description: doc.description ?? null,
		source_video_id: doc.source_video_id ?? null,
		transcript_pdf_id: doc.transcript_pdf_id ?? null,
		view_count: typeof doc.view_count === 'number' && doc.view_count > 0 ? doc.view_count : 0,
		subtitle_srt_url: doc.subtitle_srt_url ?? null,
		subtitle_srt_s3_key: doc.subtitle_srt_s3_key ?? null,
		subtitle_filename: doc.subtitle_filename ?? null,
		subtitle_offset_into_recording_ms:
			typeof doc.subtitle_offset_into_recording_ms === 'number'
				? doc.subtitle_offset_into_recording_ms
				: null,
		subtitles_hidden: doc.subtitles_hidden === true,
		french_audio_url: doc.french_audio_s3_url ?? null,
		french_audio_size_bytes:
			typeof doc.french_audio_size_bytes === 'number' ? doc.french_audio_size_bytes : null,
		french_audio_duration_sec:
			typeof doc.french_audio_duration_sec === 'number' ? doc.french_audio_duration_sec : null,
		original_audio_language:
			typeof doc.original_audio_language === 'string' && doc.original_audio_language
				? doc.original_audio_language
				: 'rw'
	};
}

export async function getRecentPublished(limit = 5): Promise<PublishedRecording[]> {
	try {
		// Same `(published, status, started_at desc)` compound index the other
		// list queries rely on — ensures the /live revalidation render seeks
		// directly instead of scanning + sorting in memory.
		await ensureIndexes();
		const db = await getDb();
		const rows = (await db
			.collection('recordings')
			.find({ published: true, status: 'ready' })
			.sort({ started_at: -1 })
			.limit(limit)
			.toArray()) as unknown as RecordingRow[];
		return rows.map(toPublic);
	} catch (err) {
		console.error('[recordings] getRecentPublished failed', err);
		return [];
	}
}

/** Resolve the published rediffusion that came out of a given live session.
 *
 *  A shared live link carries the broadcast's `started_at` (see
 *  `+shareLive.svelte`). Once that direct ends, the listener should land on the
 *  exact replay — but there is no foreign key between `broadcast_admin_state`
 *  and the `recordings` row the recorder created (the recorder runs as a
 *  separate service and only stamps its own `started_at` when ffmpeg starts).
 *  The two are correlated only by time: the recording starts a few
 *  seconds-to-minutes AFTER "Go Live" and runs until the broadcast ends.
 *
 *  So we match by `started_at` proximity: among published+ready recordings in a
 *  window around the session start, pick the one whose start is closest. Lives
 *  are spaced hours/days apart, so the nearest recording to a session timestamp
 *  is unambiguous in practice. A small lead (clock skew / recorder starting a
 *  touch early) and a generous trailing window (a long broadcast) bound the
 *  search. Returns null when no recording is published yet — the caller then
 *  just renders /live, and the link starts working once the admin publishes. */
export async function getPublishedNearSession(
	sessionStartedAtIso: string
): Promise<PublishedRecording | null> {
	try {
		const sessionMs = Date.parse(sessionStartedAtIso);
		if (Number.isNaN(sessionMs)) return null;
		await ensureIndexes();
		const db = await getDb();
		const from = new Date(sessionMs - 30 * 60 * 1000); // 30 min before go-live
		const to = new Date(sessionMs + 12 * 60 * 60 * 1000); // 12 h after
		const rows = (await db
			.collection('recordings')
			.find({ published: true, status: 'ready', started_at: { $gte: from, $lte: to } })
			.sort({ started_at: 1 })
			.limit(20)
			.toArray()) as unknown as RecordingRow[];
		if (rows.length === 0) return null;
		let best = rows[0];
		let bestDist = Infinity;
		for (const row of rows) {
			const ms =
				row.started_at instanceof Date
					? row.started_at.getTime()
					: Date.parse(String(row.started_at));
			if (Number.isNaN(ms)) continue;
			const dist = Math.abs(ms - sessionMs);
			if (dist < bestDist) {
				bestDist = dist;
				best = row;
			}
		}
		return toPublic(best);
	} catch (err) {
		console.error('[recordings] getPublishedNearSession failed', err);
		return null;
	}
}

/** Title pattern that identifies a "retransmission" — i.e. a broadcast
 *  relayed from another assembly. Local recordings (sermons from the local
 *  pastor) are everything else. Shared between listPublished's `type` filter
 *  and listRetransmissions below so both stay in sync. */
const RETRANSMISSION_TITLE_REGEX = 'retransmission|frank|ewald';

export type RecordingType = 'retransmission' | 'local';

export async function listPublished(
	options: {
		limit?: number;
		pageNumber?: number;
		q?: string;
		year?: number;
		month?: number; // 1-12
		type?: RecordingType;
	} = {}
): Promise<{ data: PublishedRecording[]; total: number }> {
	const { limit = 20, pageNumber = 1, q, year, month, type } = options;
	try {
		await ensureIndexes();
		const db = await getDb();
		const query: Record<string, unknown> = { published: true, status: 'ready' };

		// Both q (user search) and type (retransmission/local) constrain the
		// title — combine via $and so neither clobbers the other.
		const titleConditions: Record<string, unknown>[] = [];
		if (q && q.trim().length > 0) {
			// Escape regex metacharacters so user input is treated literally.
			const escaped = q.trim().replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
			titleConditions.push({ title: { $regex: escaped, $options: 'i' } });
		}
		if (type === 'retransmission') {
			titleConditions.push({ title: { $regex: RETRANSMISSION_TITLE_REGEX, $options: 'i' } });
		} else if (type === 'local') {
			titleConditions.push({
				title: { $not: { $regex: RETRANSMISSION_TITLE_REGEX, $options: 'i' } }
			});
		}
		if (titleConditions.length === 1) {
			Object.assign(query, titleConditions[0]);
		} else if (titleConditions.length > 1) {
			query.$and = titleConditions;
		}

		if (year) {
			// Date-only range so the compound index `(published, status, started_at)`
			// can seek directly and emit results in sorted order. Mixing in a
			// string-type $or branch breaks that: Mongo would need two separate
			// IXSCANs and an in-memory merge-sort. We assume started_at is stored
			// as a BSON Date — the legacy `Date | string` typing is defensive but
			// live data uses Date.
			const from = month ? new Date(Date.UTC(year, month - 1, 1)) : new Date(Date.UTC(year, 0, 1));
			const to = month ? new Date(Date.UTC(year, month, 1)) : new Date(Date.UTC(year + 1, 0, 1));
			query.started_at = { $gte: from, $lt: to };
		}

		const skip = (pageNumber - 1) * limit;
		const [rows, total] = await Promise.all([
			db
				.collection('recordings')
				.find(query)
				.sort({ started_at: -1 })
				.skip(skip)
				.limit(limit)
				.toArray(),
			db.collection('recordings').countDocuments(query)
		]);
		return { data: (rows as unknown as RecordingRow[]).map(toPublic), total };
	} catch (err) {
		console.error('[recordings] listPublished failed', err);
		return { data: [], total: 0 };
	}
}

// Years change roughly once a year; a short in-process TTL eliminates a full
// scan from the hot path of every filter change. Module-scoped so it survives
// between requests on the same server instance.
const YEARS_TTL_MS = 10 * 60 * 1000;
let yearsCache: { value: number[]; expires: number } | null = null;

// Total count of published+ready recordings. Used for the page header, so
// stale-within-minutes is fine — new recordings appear on the next refresh.
const TOTAL_TTL_MS = 5 * 60 * 1000;
let totalCache: { value: number; expires: number } | null = null;

export async function getPublishedTotal(): Promise<number> {
	if (totalCache && totalCache.expires > Date.now()) return totalCache.value;
	try {
		const db = await getDb();
		const total = await db
			.collection('recordings')
			.countDocuments({ published: true, status: 'ready' });
		totalCache = { value: total, expires: Date.now() + TOTAL_TTL_MS };
		return total;
	} catch (err) {
		console.error('[recordings] getPublishedTotal failed', err);
		return totalCache?.value ?? 0;
	}
}

export async function getAvailableYears(): Promise<number[]> {
	if (yearsCache && yearsCache.expires > Date.now()) return yearsCache.value;
	try {
		const db = await getDb();
		// Projection keeps the payload small (~8 bytes/doc). The in-process TTL
		// cache below is what actually makes this cheap — this query only runs
		// on cold start or cache expiry. Avoided an aggregation with $toDate
		// because it's noticeably slower per-doc than a simple projection.
		const rows = (await db
			.collection('recordings')
			.find({ published: true, status: 'ready' }, { projection: { started_at: 1 } })
			.toArray()) as unknown as Array<{ started_at: Date | string }>;
		const years = new Set<number>();
		for (const row of rows) {
			const d = row.started_at instanceof Date ? row.started_at : new Date(row.started_at);
			if (!Number.isNaN(d.getTime())) years.add(d.getUTCFullYear());
		}
		const sorted = [...years].sort((a, b) => b - a);
		yearsCache = { value: sorted, expires: Date.now() + YEARS_TTL_MS };
		return sorted;
	} catch (err) {
		console.error('[recordings] getAvailableYears failed', err);
		return yearsCache?.value ?? [];
	}
}

/** List recordings whose title matches a retransmission-like keyword
 *  ("Retransmission", "Frank", or "Ewald", case-insensitive). Used by the
 *  Prédications page to surface live-broadcast archives alongside curated
 *  sermons when the Ewald Frank / "Tous" author filter is active. Shares
 *  the `(published, status, started_at)` compound index created in
 *  ensureIndexes() — the regex only filters the already-indexed result set. */
export async function listRetransmissions(
	options: {
		limit?: number;
		pageNumber?: number;
		q?: string;
		year?: number;
		sortField?: string; // 'title' | 'started_at' | 'duration_sec'
		sortOrder?: 'asc' | 'desc';
	} = {}
): Promise<{ data: PublishedRecording[]; total: number }> {
	const {
		limit = 12,
		pageNumber = 1,
		q,
		year,
		sortField = 'started_at',
		sortOrder = 'desc'
	} = options;
	try {
		await ensureIndexes();
		const db = await getDb();
		const query: Record<string, unknown> = {
			published: true,
			status: 'ready',
			title: { $regex: RETRANSMISSION_TITLE_REGEX, $options: 'i' }
		};

		if (q && q.trim().length > 0) {
			const escaped = q.trim().replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
			// Combine with the retransmission regex via $and so both conditions
			// apply without clobbering each other.
			query.$and = [
				{ title: { $regex: RETRANSMISSION_TITLE_REGEX, $options: 'i' } },
				{ title: { $regex: escaped, $options: 'i' } }
			];
			delete query.title;
		}

		if (year) {
			query.started_at = {
				$gte: new Date(Date.UTC(year, 0, 1)),
				$lt: new Date(Date.UTC(year + 1, 0, 1))
			};
		}

		const allowedSorts = new Set(['title', 'started_at', 'duration_sec']);
		const safeSortField = allowedSorts.has(sortField) ? sortField : 'started_at';
		const sort: Record<string, 1 | -1> = { [safeSortField]: sortOrder === 'asc' ? 1 : -1 };

		const skip = (pageNumber - 1) * limit;
		const [rows, total] = await Promise.all([
			db.collection('recordings').find(query).sort(sort).skip(skip).limit(limit).toArray(),
			db.collection('recordings').countDocuments(query)
		]);
		return { data: (rows as unknown as RecordingRow[]).map(toPublic), total };
	} catch (err) {
		console.error('[recordings] listRetransmissions failed', err);
		return { data: [], total: 0 };
	}
}

export async function getPublishedById(id: string): Promise<PublishedRecording | null> {
	try {
		const { ObjectId } = await import('mongodb');
		if (!ObjectId.isValid(id)) return null;
		const db = await getDb();
		const row = (await db.collection('recordings').findOne({
			_id: new ObjectId(id),
			published: true,
			status: 'ready'
		})) as unknown as RecordingRow | null;
		return row ? toPublic(row) : null;
	} catch (err) {
		console.error('[recordings] getPublishedById failed', err);
		return null;
	}
}

/** Atomically bump a recording's view counter. Called fire-and-forget from a
 *  dedicated endpoint after the page has already rendered, so it never sits on
 *  the page's critical path. Scoped to published+ready docs so hitting the
 *  endpoint with a draft/unknown id is a no-op. Returns the new count, or null
 *  if nothing matched. */
export async function incrementViewCount(id: string): Promise<number | null> {
	try {
		if (!ObjectId.isValid(id)) return null;
		const db = await getDb();
		const result = await db
			.collection('recordings')
			.findOneAndUpdate(
				{ _id: new ObjectId(id), published: true, status: 'ready' },
				{ $inc: { view_count: 1 } },
				{ returnDocument: 'after', projection: { view_count: 1 } }
			);
		const doc = result as { view_count?: number } | null;
		return typeof doc?.view_count === 'number' ? doc.view_count : null;
	} catch (err) {
		console.error('[recordings] incrementViewCount failed', err);
		return null;
	}
}

export interface RecordingTranscript {
	url: string;
	filename: string;
	size: number;
}

/** Find the `videos._id` for a recording from its stored YouTube id only.
 *  The previous date-based title fallback was removed: matching any video
 *  whose title merely contained the recording's YYYY-MM-DD attached the wrong
 *  same-day PDF to recordings nobody had explicitly linked (a recurring admin
 *  complaint). A PDF now resolves only from an explicit `transcript_pdf_id` or
 *  a real `source_video_id` link — attach the YouTube URL (or upload the PDF)
 *  in the admin to surface a transcript. */
async function findVideoObjectIdForRecording(
	db: Awaited<ReturnType<typeof getDb>>,
	sourceVideoId: string | null
): Promise<unknown> {
	if (!sourceVideoId) return null;
	const v = await db
		.collection('videos')
		.findOne({ id: sourceVideoId }, { projection: { _id: 1 } });
	return v?._id ?? null;
}

/** Resolve the PDF transcription for a recording. The `pdfs` collection keys
 *  to `videos._id` (ObjectId); we bridge via either the stored YouTube id or
 *  a title-date match so live-broadcast-created rows (no `source_video_id`)
 *  still surface their transcription. */
export async function getTranscriptForRecording(recording: {
	transcript_pdf_id?: string | null;
	source_video_id: string | null;
	started_at: string | null;
}): Promise<RecordingTranscript | null> {
	try {
		// 'none' = admin explicitly detached the PDF from this recording. Skip
		// everything, including the date-based fallback — that fallback is what
		// attaches a wrong same-day PDF in the first place.
		if (recording.transcript_pdf_id === 'none') return null;

		const db = await getDb();
		if (recording.transcript_pdf_id && ObjectId.isValid(recording.transcript_pdf_id)) {
			const attached = await db
				.collection('pdfs')
				.findOne(
					{ _id: new ObjectId(recording.transcript_pdf_id) },
					{ projection: { url: 1, filename: 1, size: 1 } }
				);
			if (attached?.url) {
				return {
					url: attached.url as string,
					filename: (attached.filename as string) ?? 'transcription.pdf',
					size: (attached.size as number) ?? 0
				};
			}
		}

		const videoObjectId = await findVideoObjectIdForRecording(db, recording.source_video_id);
		if (!videoObjectId) return null;
		const videoObjectIdString = String(videoObjectId);
		const pdf = await db
			.collection('pdfs')
			.findOne(
				{ $or: [{ videoId: videoObjectId }, { videoId: videoObjectIdString }] },
				{ projection: { url: 1, filename: 1, size: 1 } }
			);
		if (!pdf?.url) return null;
		return {
			url: pdf.url as string,
			filename: (pdf.filename as string) ?? 'transcription.pdf',
			size: (pdf.size as number) ?? 0
		};
	} catch (err) {
		console.error('[recordings] getTranscriptForRecording failed', err);
		return null;
	}
}
