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
			await db.collection('recordings').createIndex(
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
		source_video_id: doc.source_video_id ?? null
	};
}

export async function getRecentPublished(limit = 5): Promise<PublishedRecording[]> {
	try {
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

export async function listPublished(options: {
	limit?: number;
	pageNumber?: number;
	q?: string;
	year?: number;
	month?: number; // 1-12
} = {}): Promise<{ data: PublishedRecording[]; total: number }> {
	const { limit = 20, pageNumber = 1, q, year, month } = options;
	try {
		await ensureIndexes();
		const db = await getDb();
		const query: Record<string, unknown> = { published: true, status: 'ready' };

		if (q && q.trim().length > 0) {
			// Escape regex metacharacters so user input is treated literally.
			const escaped = q.trim().replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
			query.title = { $regex: escaped, $options: 'i' };
		}

		if (year) {
			// Date-only range so the compound index `(published, status, started_at)`
			// can seek directly and emit results in sorted order. Mixing in a
			// string-type $or branch breaks that: Mongo would need two separate
			// IXSCANs and an in-memory merge-sort. We assume started_at is stored
			// as a BSON Date — the legacy `Date | string` typing is defensive but
			// live data uses Date.
			const from = month
				? new Date(Date.UTC(year, month - 1, 1))
				: new Date(Date.UTC(year, 0, 1));
			const to = month
				? new Date(Date.UTC(year, month, 1))
				: new Date(Date.UTC(year + 1, 0, 1));
			query.started_at = { $gte: from, $lt: to };
		}

		const skip = (pageNumber - 1) * limit;
		const [rows, total] = await Promise.all([
			db.collection('recordings').find(query).sort({ started_at: -1 }).skip(skip).limit(limit).toArray(),
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
export async function listRetransmissions(options: {
	limit?: number;
	pageNumber?: number;
	q?: string;
	year?: number;
	sortField?: string; // 'title' | 'started_at' | 'duration_sec'
	sortOrder?: 'asc' | 'desc';
} = {}): Promise<{ data: PublishedRecording[]; total: number }> {
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
			title: { $regex: 'retransmission|frank|ewald', $options: 'i' }
		};

		if (q && q.trim().length > 0) {
			const escaped = q.trim().replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
			// Combine with the retransmission regex via $and so both conditions
			// apply without clobbering each other.
			query.$and = [
				{ title: { $regex: 'retransmission|frank|ewald', $options: 'i' } },
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
			db
				.collection('recordings')
				.find(query)
				.sort(sort)
				.skip(skip)
				.limit(limit)
				.toArray(),
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
		const row = (await db
			.collection('recordings')
			.findOne({ _id: new ObjectId(id), published: true, status: 'ready' })) as unknown as RecordingRow | null;
		return row ? toPublic(row) : null;
	} catch (err) {
		console.error('[recordings] getPublishedById failed', err);
		return null;
	}
}

export interface RecordingTranscript {
	url: string;
	filename: string;
	size: number;
}

/** Find the `videos._id` for a recording — prefers the stored YouTube id,
 *  falls back to date-based title match so recordings created by the live
 *  broadcast recorder (which never sets `source_video_id`) still resolve. */
async function findVideoObjectIdForRecording(
	db: Awaited<ReturnType<typeof getDb>>,
	sourceVideoId: string | null,
	startedAt: string | null
): Promise<unknown> {
	// 1) Direct lookup by stored YouTube id.
	if (sourceVideoId) {
		const v = await db
			.collection('videos')
			.findOne({ id: sourceVideoId }, { projection: { _id: 1 } });
		if (v) return v._id;
	}
	// 2) Fallback: pick the video whose title begins with the recording's
	//    YYYY-MM-DD. Older channel entries also have the date mid-title with
	//    stray whitespace ("[ZURICH] - 2023 -11 - 15"), so we search unanchored
	//    and tolerate spaces around hyphens.
	if (!startedAt) return null;
	const day = startedAt.slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
	const [y, mo, d] = day.split('-');
	const flexible = String.raw`${y}\s*-\s*${mo}\s*-\s*${d}`;
	const v = await db
		.collection('videos')
		.findOne({ title: { $regex: flexible } }, { projection: { _id: 1 } });
	return v?._id ?? null;
}

/** Resolve the PDF transcription for a recording. The `pdfs` collection keys
 *  to `videos._id` (ObjectId); we bridge via either the stored YouTube id or
 *  a title-date match so live-broadcast-created rows (no `source_video_id`)
 *  still surface their transcription. */
export async function getTranscriptForRecording(recording: {
	source_video_id: string | null;
	started_at: string | null;
}): Promise<RecordingTranscript | null> {
	try {
		const db = await getDb();
		const videoObjectId = await findVideoObjectIdForRecording(
			db,
			recording.source_video_id,
			recording.started_at
		);
		if (!videoObjectId) return null;
		const pdf = await db
			.collection('pdfs')
			.findOne(
				{ videoId: videoObjectId },
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
