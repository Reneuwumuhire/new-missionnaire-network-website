import { randomBytes } from 'node:crypto';
import { getDb } from './mongo';
import { ObjectId, type Document, type Filter } from 'mongodb';
import type { MusicAudio } from '$lib/models/music-audio';
import type { AdminUser } from '$lib/models/admin-user';
import type { AdminSession } from '$lib/models/session';
import type { AuditAction, AuditLog } from '$lib/models/audit-log';
import type { Recording, RecordingStatus } from '$lib/models/recording';

// ── Serialization ──

function serializeDocument<T = unknown>(doc: unknown): T {
	if (doc == null) return doc as T;
	if (doc instanceof ObjectId) return doc.toString() as T;
	if (doc instanceof Date) return doc.toISOString() as T;
	if (Array.isArray(doc)) return doc.map((item) => serializeDocument(item)) as T;
	if (typeof doc === 'object' && (doc as object).constructor === Object) {
		const result: Record<string, unknown> = {};
		for (const key in doc as Record<string, unknown>) {
			if (Object.hasOwn(doc as object, key)) {
				result[key] = serializeDocument((doc as Record<string, unknown>)[key]);
			}
		}
		return result as T;
	}
	return doc as T;
}

// ── Fuzzy search ──

const ACCENT_MAP: Record<string, string[]> = {
	a: ['a', 'à', 'â', 'ä', 'á', 'ã', 'å'],
	e: ['e', 'è', 'é', 'ê', 'ë'],
	i: ['i', 'ì', 'í', 'î', 'ï'],
	o: ['o', 'ò', 'ó', 'ô', 'õ', 'ö'],
	u: ['u', 'ù', 'ú', 'û', 'ü'],
	c: ['c', 'ç'],
	n: ['n', 'ñ'],
	y: ['y', 'ý', 'ÿ']
};

const OPT_COMBINING = '[\u0300-\u036f]?';

// Compiled-pattern LRU cache. Admin search inputs repeat heavily (debounced
// keystrokes, pagination over the same query), so rebuilding the accent-folding
// pattern per request is wasted work. Map iteration order doubles as recency:
// on hit we re-insert the key, on overflow we evict the oldest entry.
const FUZZY_PATTERN_CACHE_MAX = 200;
const fuzzyPatternCache = new Map<string, string>();

function getFuzzySearchPattern(search: string): string {
	const cached = fuzzyPatternCache.get(search);
	if (cached !== undefined) {
		fuzzyPatternCache.delete(search);
		fuzzyPatternCache.set(search, cached);
		return cached;
	}

	const pattern = buildFuzzySearchPattern(search);
	if (fuzzyPatternCache.size >= FUZZY_PATTERN_CACHE_MAX) {
		const oldest = fuzzyPatternCache.keys().next().value;
		if (oldest !== undefined) fuzzyPatternCache.delete(oldest);
	}
	fuzzyPatternCache.set(search, pattern);
	return pattern;
}

function buildFuzzySearchPattern(search: string): string {
	const normalized = search.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
	let pattern = '';
	for (const char of normalized) {
		const lower = char.toLowerCase();
		if (lower in ACCENT_MAP) {
			pattern += '(?:' + ACCENT_MAP[lower].join('|') + ')' + OPT_COMBINING;
		} else if (/[a-z]/i.test(char)) {
			pattern += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + OPT_COMBINING;
		} else if (/[0-9]/.test(char)) {
			pattern += char;
		} else if (char === "'" || char === '\u2019' || char === '\u2018') {
			pattern += "['ʼ\u2018\u2019]?";
		} else if (char === ' ') {
			pattern += '[\\s\\-]?';
		} else {
			pattern += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		}
	}
	return pattern;
}

// ══════════════════════════════════════
//  MUSIC AUDIO QUERIES
// ══════════════════════════════════════

export async function queryMusicAudio(options: {
	category?: string;
	search?: string;
	artist?: string;
	lyrics?: 'with' | 'without';
	limit?: number;
	pageNumber?: number;
	orderBy?: string;
}): Promise<{ data: MusicAudio[]; total: number }> {
	const {
		category,
		search,
		artist,
		lyrics,
		limit = 20,
		pageNumber = 1,
		orderBy = 'uploaded_at:desc'
	} = options;

	const db = await getDb();
	const conditions: Filter<Document>[] = [];

	if (category && category !== 'All') {
		conditions.push({ category });
	}

	// Early bail: single-character searches match nearly every row while still
	// paying for a regex scan over the whole collection — treat them as "no
	// search" (the UI fires queries per keystroke; 2+ chars arrive right after).
	if (search && search.trim().length >= 2) {
		const searchPattern = getFuzzySearchPattern(search.trim());
		const fields = ['title', 'book_full_name', 'artist'];
		const searchConditions: Filter<Document>[] = [];
		for (const field of fields) {
			searchConditions.push({ [field]: { $regex: searchPattern, $options: 'i' } });
		}
		const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		for (const field of fields) {
			searchConditions.push({ [field]: { $regex: escaped, $options: 'i' } });
		}
		conditions.push({ $or: searchConditions });
	}

	if (artist) {
		conditions.push({ artist });
	}

	if (lyrics === 'with' || lyrics === 'without') {
		const lyricsAudioIds = await db
			.collection('music_lyrics')
			.distinct('audio_id');
		const objectIds = lyricsAudioIds
			.filter((value): value is string => typeof value === 'string' && ObjectId.isValid(value))
			.map((value) => new ObjectId(value));
		conditions.push({ _id: lyrics === 'with' ? { $in: objectIds } : { $nin: objectIds } });
	}

	const query: Filter<Document> = conditions.length > 0 ? { $and: conditions } : {};
	const skip = (pageNumber - 1) * limit;
	const total = await db
		.collection('music_audio')
		.countDocuments(query, { collation: { locale: 'fr', strength: 1 } });

	const [property, order] = orderBy.split(/[: ,]/);
	const sort: Record<string, 1 | -1> = {};
	sort[property] = order === 'asc' ? 1 : -1;

	const data = await db
		.collection('music_audio')
		.find(query)
		.sort(sort)
		.collation({ locale: 'fr', numericOrdering: true })
		.skip(skip)
		.limit(limit)
		.toArray();

	return {
		data: data.map((doc) => serializeDocument<MusicAudio>(doc)),
		total
	};
}

export async function getMusicAudioById(id: string): Promise<MusicAudio | null> {
	const db = await getDb();
	const doc = await db.collection('music_audio').findOne({ _id: new ObjectId(id) });
	return doc ? serializeDocument<MusicAudio>(doc) : null;
}

export async function createMusicAudio(data: {
	title: string;
	artist: string | null;
	category: string;
	book: string | null;
	book_full_name: string | null;
	number: number | null;
	s3_key: string;
	s3_url: string;
	file_size: number;
	duration: number | null;
	format: string;
	uploaded_by: string;
}): Promise<string> {
	const db = await getDb();
	const result = await db.collection('music_audio').insertOne({
		...data,
		uploaded_at: new Date(),
		updated_at: null,
		updated_by: null
	});
	invalidateMusicCatalogCache();
	return result.insertedId.toString();
}

export async function updateMusicAudio(
	id: string,
	updates: Record<string, unknown>,
	updatedBy: string
): Promise<boolean> {
	const db = await getDb();
	const result = await db.collection('music_audio').updateOne(
		{ _id: new ObjectId(id) },
		{
			$set: {
				...updates,
				updated_at: new Date(),
				updated_by: updatedBy
			}
		}
	);
	if (result.modifiedCount > 0) invalidateMusicCatalogCache();
	return result.modifiedCount > 0;
}

export async function deleteMusicAudio(id: string): Promise<{ s3_key: string } | null> {
	const db = await getDb();
	const doc = await db.collection('music_audio').findOne({ _id: new ObjectId(id) });
	if (!doc) return null;
	await db.collection('music_audio').deleteOne({ _id: new ObjectId(id) });
	invalidateMusicCatalogCache();
	return { s3_key: doc.s3_key as string };
}

export async function deleteMusicAudioBulk(ids: string[]): Promise<{ s3_keys: string[] }> {
	const db = await getDb();
	const objectIds = ids.map((id) => new ObjectId(id));
	const docs = await db
		.collection('music_audio')
		.find({ _id: { $in: objectIds } })
		.project({ s3_key: 1 })
		.toArray();
	const s3_keys = docs.map((d) => d.s3_key as string);
	await db.collection('music_audio').deleteMany({ _id: { $in: objectIds } });
	invalidateMusicCatalogCache();
	return { s3_keys };
}

export async function bulkUpdateCategory(
	ids: string[],
	category: string,
	updatedBy: string
): Promise<number> {
	const db = await getDb();
	const objectIds = ids.map((id) => new ObjectId(id));
	const result = await db
		.collection('music_audio')
		.updateMany(
			{ _id: { $in: objectIds } },
			{ $set: { category, updated_at: new Date(), updated_by: updatedBy } }
		);
	if (result.modifiedCount > 0) invalidateMusicCatalogCache();
	return result.modifiedCount;
}

// Distinct artists/categories rarely change but are read on every audio listing
// load and every debounced search keystroke. A short per-process TTL cache cuts
// the duplicate `distinct()` queries to roughly one per minute. Mutations
// (create/delete/bulk-update) call invalidateMusicCatalogCache() so freshly
// added artists/categories show up in filter dropdowns without delay.
const MUSIC_CATALOG_TTL_MS = 60_000;
let cachedArtists: { value: string[]; cachedAt: number } | null = null;
let cachedCategories: { value: string[]; cachedAt: number } | null = null;

export function invalidateMusicCatalogCache(): void {
	cachedArtists = null;
	cachedCategories = null;
}

export async function getMusicArtists(): Promise<string[]> {
	if (cachedArtists && Date.now() - cachedArtists.cachedAt < MUSIC_CATALOG_TTL_MS) {
		return cachedArtists.value;
	}
	const db = await getDb();
	const artists = await db.collection('music_audio').distinct('artist', {
		artist: { $ne: null, $exists: true }
	});
	const value = artists.filter((a): a is string => typeof a === 'string' && a.length > 0).sort();
	cachedArtists = { value, cachedAt: Date.now() };
	return value;
}

export async function getMusicCategories(): Promise<string[]> {
	if (cachedCategories && Date.now() - cachedCategories.cachedAt < MUSIC_CATALOG_TTL_MS) {
		return cachedCategories.value;
	}
	const db = await getDb();
	const categories = await db.collection('music_audio').distinct('category');
	const value = categories.filter((c): c is string => typeof c === 'string' && c.length > 0).sort();
	cachedCategories = { value, cachedAt: Date.now() };
	return value;
}

export async function checkDuplicateAudio(
	title: string,
	artist: string | null,
	fileSize: number,
	format: string
): Promise<MusicAudio[]> {
	const db = await getDb();
	const conditions: Filter<Document>[] = [
		{ $and: [{ title }, ...(artist ? [{ artist }] : [])] },
		{ $and: [{ file_size: fileSize }, { format }] }
	];
	const docs = await db.collection('music_audio').find({ $or: conditions }).limit(5).toArray();
	return docs.map((doc) => serializeDocument<MusicAudio>(doc));
}

// ══════════════════════════════════════
//  STATS
// ══════════════════════════════════════

export interface DashboardStats {
	totalTracks: number;
	totalStorage: number;
	uploadsThisMonth: number;
	missingMetadata: number;
	categoryDistribution: { category: string; count: number }[];
	recentUploads: MusicAudio[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
	const db = await getDb();
	const collection = db.collection('music_audio');

	const now = new Date();
	const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

	const [
		totalTracks,
		totalStorageResult,
		uploadsThisMonth,
		missingMetadata,
		categoryDistribution,
		recentUploads
	] = await Promise.all([
		collection.countDocuments(),
		collection.aggregate([{ $group: { _id: null, total: { $sum: '$file_size' } } }]).toArray(),
		collection.countDocuments({ uploaded_at: { $gte: firstOfMonth } }),
		collection.countDocuments({
			$or: [{ title: { $in: [null, ''] } }, { artist: { $in: [null, ''] } }, { duration: null }]
		}),
		collection
			.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }])
			.toArray(),
		collection.find().sort({ uploaded_at: -1 }).limit(10).toArray()
	]);

	return {
		totalTracks,
		totalStorage: totalStorageResult[0]?.total ?? 0,
		uploadsThisMonth,
		missingMetadata,
		categoryDistribution: categoryDistribution.map((d) => ({
			category: (d._id as string) || 'Unknown',
			count: d.count as number
		})),
		recentUploads: recentUploads.map((doc) => serializeDocument<MusicAudio>(doc))
	};
}

// ══════════════════════════════════════
//  ADMIN USERS
// ══════════════════════════════════════

export async function findAdminByEmail(email: string): Promise<AdminUser | null> {
	const db = await getDb();
	const doc = await db.collection('admin_users').findOne({ email: email.toLowerCase() });
	return doc ? serializeDocument<AdminUser>(doc) : null;
}

export async function updateLastLogin(userId: string): Promise<void> {
	const db = await getDb();
	await db
		.collection('admin_users')
		.updateOne({ _id: new ObjectId(userId) }, { $set: { last_login: new Date() } });
}

export async function updateAdminProfile(
	email: string,
	updates: { name?: string; email?: string }
): Promise<boolean> {
	const db = await getDb();
	const result = await db
		.collection('admin_users')
		.updateOne({ email: email.toLowerCase() }, { $set: updates });
	return result.modifiedCount > 0;
}

export async function updateAdminPassword(
	email: string,
	newPasswordHash: string
): Promise<boolean> {
	const db = await getDb();
	const result = await db
		.collection('admin_users')
		.updateOne({ email: email.toLowerCase() }, { $set: { password_hash: newPasswordHash } });
	return result.modifiedCount > 0;
}

export async function createAdminUser(user: {
	email: string;
	password_hash: string;
	name: string;
	role: 'superadmin' | 'editor';
}): Promise<string> {
	const db = await getDb();
	const result = await db.collection('admin_users').insertOne({
		...user,
		email: user.email.toLowerCase(),
		created_at: new Date(),
		last_login: null,
		is_active: true
	});
	return result.insertedId.toString();
}

export async function getAllAdminUsers(): Promise<AdminUser[]> {
	const db = await getDb();
	const docs = await db.collection('admin_users').find().sort({ created_at: -1 }).toArray();
	return docs.map((doc) => serializeDocument<AdminUser>(doc));
}

export async function toggleAdminUserActive(email: string, isActive: boolean): Promise<boolean> {
	const db = await getDb();
	const result = await db
		.collection('admin_users')
		.updateOne({ email: email.toLowerCase() }, { $set: { is_active: isActive } });
	return result.modifiedCount > 0;
}

export async function resetAdminPassword(email: string, newPasswordHash: string): Promise<boolean> {
	const db = await getDb();
	const result = await db
		.collection('admin_users')
		.updateOne({ email: email.toLowerCase() }, { $set: { password_hash: newPasswordHash } });
	return result.modifiedCount > 0;
}

export async function updateAdminPermissions(
	email: string,
	permissions: {
		can_add: boolean;
		can_edit: boolean;
		can_delete: boolean;
		can_manage_recordings: boolean;
		can_review_lyrics: boolean;
		can_view_questions: boolean;
		can_answer_questions: boolean;
		can_moderate_questions: boolean;
	}
): Promise<boolean> {
	const db = await getDb();
	const result = await db
		.collection('admin_users')
		.updateOne({ email: email.toLowerCase() }, { $set: { permissions } });
	return result.modifiedCount > 0;
}

// ══════════════════════════════════════
//  SESSIONS
// ══════════════════════════════════════

export async function createSessionRecord(session: {
	user_id: string;
	token: string;
	expires_at: Date;
	ip_address: string | null;
	user_agent: string | null;
}): Promise<void> {
	const db = await getDb();
	await db.collection('admin_sessions').insertOne({
		...session,
		created_at: new Date()
	});
}

export async function findSession(token: string): Promise<AdminSession | null> {
	const db = await getDb();
	const doc = await db.collection('admin_sessions').findOne({ token });
	return doc ? serializeDocument<AdminSession>(doc) : null;
}

export async function deleteSession(token: string): Promise<void> {
	const db = await getDb();
	await db.collection('admin_sessions').deleteOne({ token });
}

// ══════════════════════════════════════
//  LOGIN ATTEMPTS (brute-force throttle)
// ══════════════════════════════════════

const LOGIN_ATTEMPTS_COLLECTION = 'admin_login_attempts';
export const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 min
export const LOGIN_ATTEMPT_MAX_FAILURES = 5;

// Lazy index creation — same no-migration pattern as ensureScheduledLiveIndexes
// below: createIndex is a no-op when the index already exists. The TTL index
// makes Mongo garbage-collect attempt documents ~15 min after insertion, so the
// collection stays tiny without a cleanup job; the compound index serves the
// per-(email, ip) window count.
let loginAttemptIndexesEnsured: Promise<void> | null = null;
async function ensureLoginAttemptIndexes(): Promise<void> {
	if (loginAttemptIndexesEnsured !== null) return loginAttemptIndexesEnsured;
	loginAttemptIndexesEnsured = (async () => {
		try {
			const db = await getDb();
			const collection = db.collection(LOGIN_ATTEMPTS_COLLECTION);
			await collection.createIndex(
				{ created_at: 1 },
				{ expireAfterSeconds: LOGIN_ATTEMPT_WINDOW_MS / 1000, name: 'created_at_ttl' }
			);
			await collection.createIndex(
				{ email: 1, ip_address: 1, created_at: 1 },
				{ name: 'email_ip_createdAt' }
			);
		} catch (err) {
			loginAttemptIndexesEnsured = null;
			console.error('[admin_login_attempts] ensureIndexes failed', err);
		}
	})();
	return loginAttemptIndexesEnsured;
}

export async function recordLoginFailure(email: string, ip: string | null): Promise<void> {
	await ensureLoginAttemptIndexes();
	const db = await getDb();
	await db.collection(LOGIN_ATTEMPTS_COLLECTION).insertOne({
		email: email.toLowerCase(),
		ip_address: ip,
		created_at: new Date()
	});
}

/** Failed attempts for this (email, ip) pair within the rolling window. The
 *  TTL monitor only runs every ~60s, so the time filter stays authoritative. */
export async function countRecentLoginFailures(email: string, ip: string | null): Promise<number> {
	await ensureLoginAttemptIndexes();
	const db = await getDb();
	return db.collection(LOGIN_ATTEMPTS_COLLECTION).countDocuments({
		email: email.toLowerCase(),
		ip_address: ip,
		created_at: { $gte: new Date(Date.now() - LOGIN_ATTEMPT_WINDOW_MS) }
	});
}

export async function clearLoginFailures(email: string, ip: string | null): Promise<void> {
	const db = await getDb();
	await db.collection(LOGIN_ATTEMPTS_COLLECTION).deleteMany({
		email: email.toLowerCase(),
		ip_address: ip
	});
}

// ══════════════════════════════════════
//  AUDIT LOG
// ══════════════════════════════════════

export async function logAudit(entry: {
	user_id: string;
	user_email: string;
	action: AuditAction;
	target_collection: string;
	target_id: string | null;
	target_ids?: string[] | null;
	changes?: Record<string, { old: unknown; new: unknown }> | null;
	ip_address: string | null;
}): Promise<void> {
	const db = await getDb();
	await db.collection('audit_log').insertOne({
		...entry,
		target_ids: entry.target_ids ?? null,
		changes: entry.changes ?? null,
		timestamp: new Date()
	});
}

export async function getRecentAuditLogs(limit: number = 20): Promise<AuditLog[]> {
	const db = await getDb();
	const docs = await db
		.collection('audit_log')
		.find()
		.sort({ timestamp: -1 })
		.limit(limit)
		.toArray();
	return docs.map((doc) => serializeDocument<AuditLog>(doc));
}

// ══════════════════════════════════════
//  RECORDINGS (live broadcast archive)
// ══════════════════════════════════════

export async function listRecordings(
	options: {
		limit?: number;
		pageNumber?: number;
		publishedOnly?: boolean;
		/** Free-text search on title/description/created_by (case-insensitive). */
		q?: string;
		/** Optional exact status filter. */
		status?: 'recording' | 'uploading' | 'ready' | 'failed';
		/** Optional publication filter — server-side narrowing for the admin
		 *  page so the same view can paginate "Published only", "Drafts only",
		 *  or both. */
		publishedFilter?: 'all' | 'published' | 'unpublished';
	} = {}
): Promise<{ data: Recording[]; total: number }> {
	const {
		limit = 50,
		pageNumber = 1,
		publishedOnly = false,
		q,
		status,
		publishedFilter = 'all'
	} = options;
	const db = await getDb();
	const conditions: Filter<Document>[] = [];
	if (publishedOnly) conditions.push({ published: true, status: 'ready' });
	if (status) conditions.push({ status });
	if (publishedFilter === 'published') conditions.push({ published: true });
	else if (publishedFilter === 'unpublished') conditions.push({ published: false });
	if (q && q.trim()) {
		const escaped = q.trim().replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
		conditions.push({
			$or: [
				{ title: { $regex: escaped, $options: 'i' } },
				{ description: { $regex: escaped, $options: 'i' } },
				{ created_by: { $regex: escaped, $options: 'i' } },
				{ created_by_name: { $regex: escaped, $options: 'i' } }
			]
		});
	}
	const query: Filter<Document> = conditions.length > 0 ? { $and: conditions } : {};
	const skip = (pageNumber - 1) * limit;
	const total = await db.collection('recordings').countDocuments(query);
	const data = await db
		.collection('recordings')
		.find(query)
		.sort({ started_at: -1 })
		.skip(skip)
		.limit(limit)
		.toArray();
	return {
		data: data.map((doc) => serializeDocument<Recording>(doc)),
		total
	};
}

export async function getRecordingById(id: string): Promise<Recording | null> {
	const db = await getDb();
	const doc = await db.collection('recordings').findOne({ _id: new ObjectId(id) });
	return doc ? serializeDocument<Recording>(doc) : null;
}

/** Insert a manually-uploaded recording — used to backfill a live that was
 *  missed on our platform but exists elsewhere (e.g. YouTube). The doc starts
 *  in 'uploading' status with no audio; the audio finalize step (after the
 *  MP3 lands in S3) promotes it to 'ready'. Mirrors the field shape the
 *  recorder service writes for live captures. Returns the new id. */
export async function createRecording(input: {
	title: string;
	started_at: Date;
	description?: string | null;
	thumbnail_url?: string | null;
	thumbnail_s3_key?: string | null;
	source_video_id?: string | null;
	transcript_pdf_id?: string | null;
	created_by: string;
	created_by_name?: string | null;
}): Promise<string> {
	const db = await getDb();
	const now = new Date();
	const result = await db.collection('recordings').insertOne({
		title: input.title,
		started_at: input.started_at,
		ended_at: null,
		duration_sec: null,
		s3_key: null,
		s3_url: null,
		size_bytes: null,
		status: 'uploading',
		published: false,
		created_by: input.created_by,
		created_by_name: input.created_by_name ?? null,
		failure_reason: null,
		thumbnail_url: input.thumbnail_url ?? null,
		thumbnail_s3_key: input.thumbnail_s3_key ?? null,
		description: input.description ?? null,
		source_video_id: input.source_video_id ?? null,
		transcript_pdf_id: input.transcript_pdf_id ?? null,
		peaks: null,
		peaks_duration_sec: null,
		updated_at: now
	});
	return result.insertedId.toString();
}

export async function updateRecording(
	id: string,
	updates: Partial<{
		title: string;
		published: boolean;
		status: RecordingStatus;
		description: string | null;
		thumbnail_url: string | null;
		thumbnail_s3_key: string | null;
		s3_key: string;
		s3_url: string;
		size_bytes: number;
		duration_sec: number;
		peaks: number[] | null;
		peaks_duration_sec: number | null;
		source_video_id: string | null;
		transcript_pdf_id: string | null;
		subtitle_srt_url: string | null;
		subtitle_srt_s3_key: string | null;
		subtitle_filename: string | null;
		subtitle_offset_into_recording_ms: number | null;
		subtitles_hidden: boolean;
	}>
): Promise<boolean> {
	const db = await getDb();
	const result = await db.collection('recordings').updateOne(
		{ _id: new ObjectId(id) },
		{
			$set: {
				...updates,
				updated_at: new Date()
			}
		}
	);
	return result.modifiedCount > 0;
}

export async function deleteRecording(id: string): Promise<{ s3_key: string | null } | null> {
	const db = await getDb();
	const doc = await db.collection('recordings').findOne({ _id: new ObjectId(id) });
	if (!doc) return null;
	await db.collection('recordings').deleteOne({ _id: new ObjectId(id) });
	return { s3_key: (doc.s3_key as string | null | undefined) ?? null };
}

/** Returns true if the given `broadcast-thumbnails/...` S3 key is still
 *  referenced by something we don't want to break: another recording, a
 *  scheduled live, the current live broadcast thumbnail, or the saved
 *  default thumbnail.
 *
 *  Used to gate S3 `deleteObject(key)` calls — the recorder snapshots
 *  `broadcast_admin_state.thumbnail_url` into every recording it saves, so a
 *  single S3 key is typically shared across many rows. Deleting it blindly
 *  when the admin swaps the default leaves every past recording pointing at
 *  a 404 (which Vercel's image proxy then surfaces as a 502).
 *
 *  Pass `excludeRecordingId` when the caller is about to update or has just
 *  updated that row so its pre-update value doesn't count as a reference.
 *  `excludeScheduledLiveId` plays the same role for scheduled_lives edits. */
export async function isThumbnailS3KeyReferenced(
	key: string,
	options: { excludeRecordingId?: string; excludeScheduledLiveId?: string } = {}
): Promise<boolean> {
	if (!key) return false;
	const db = await getDb();

	const recordingFilter: Filter<Document> = { thumbnail_s3_key: key };
	if (options.excludeRecordingId && ObjectId.isValid(options.excludeRecordingId)) {
		recordingFilter._id = { $ne: new ObjectId(options.excludeRecordingId) };
	}
	const recordingHit = await db
		.collection('recordings')
		.findOne(recordingFilter, { projection: { _id: 1 } });
	if (recordingHit) return true;

	const scheduledFilter: Filter<Document> = { thumbnail_s3_key: key };
	if (options.excludeScheduledLiveId && ObjectId.isValid(options.excludeScheduledLiveId)) {
		scheduledFilter._id = { $ne: new ObjectId(options.excludeScheduledLiveId) };
	}
	const scheduledHit = await db
		.collection('scheduled_lives')
		.findOne(scheduledFilter, { projection: { _id: 1 } });
	if (scheduledHit) return true;

	// Read fresh so a pre-write cache snapshot doesn't make us think the
	// broadcast still owns a key it's just been replaced from.
	const broadcast = await getBroadcastAdminState({ fresh: true });
	if (broadcast.thumbnail_s3_key === key) return true;
	if (broadcast.default_thumbnail_s3_key === key) return true;

	return false;
}

/** Bulk-delete recordings and return every S3 key (mp3 + thumbnail) the caller
 *  should purge from object storage. DB rows are removed atomically; S3 cleanup
 *  happens in the route handler so a partial S3 failure can be logged without
 *  leaving orphan DB rows.
 *
 *  Thumbnail keys still referenced by surviving recordings or by the
 *  broadcast state are filtered out — see isThumbnailS3KeyReferenced. */
export async function deleteRecordingBulk(
	ids: string[]
): Promise<{ deleted: number; s3_keys: string[] }> {
	if (ids.length === 0) return { deleted: 0, s3_keys: [] };
	const db = await getDb();
	const objectIds = ids.map((id) => new ObjectId(id));
	const docs = await db
		.collection('recordings')
		.find({ _id: { $in: objectIds } })
		.project({ s3_key: 1, thumbnail_s3_key: 1 })
		.toArray();

	const audioKeys: string[] = [];
	const candidateThumbKeys = new Set<string>();
	for (const d of docs) {
		const s3Key = d.s3_key as string | null | undefined;
		const thumbKey = d.thumbnail_s3_key as string | null | undefined;
		if (s3Key) audioKeys.push(s3Key);
		if (thumbKey) candidateThumbKeys.add(thumbKey);
	}

	const result = await db.collection('recordings').deleteMany({ _id: { $in: objectIds } });

	// After the deleteMany above, "still referenced" means: another recording
	// (not in the deleted set, which is now gone) or the broadcast state.
	const safeThumbKeys: string[] = [];
	if (candidateThumbKeys.size > 0) {
		const broadcast = await getBroadcastAdminState({ fresh: true });
		const broadcastRefs = new Set<string>();
		if (broadcast.thumbnail_s3_key) broadcastRefs.add(broadcast.thumbnail_s3_key);
		if (broadcast.default_thumbnail_s3_key) broadcastRefs.add(broadcast.default_thumbnail_s3_key);

		const [remainingRefs, scheduledRefsDocs] = await Promise.all([
			db
				.collection('recordings')
				.find({ thumbnail_s3_key: { $in: [...candidateThumbKeys] } })
				.project({ thumbnail_s3_key: 1 })
				.toArray(),
			db
				.collection('scheduled_lives')
				.find({ thumbnail_s3_key: { $in: [...candidateThumbKeys] } })
				.project({ thumbnail_s3_key: 1 })
				.toArray()
		]);
		const recordingRefs = new Set<string>();
		for (const r of [...remainingRefs, ...scheduledRefsDocs]) {
			if (typeof r.thumbnail_s3_key === 'string') recordingRefs.add(r.thumbnail_s3_key);
		}

		for (const k of candidateThumbKeys) {
			if (!broadcastRefs.has(k) && !recordingRefs.has(k)) safeThumbKeys.push(k);
		}
	}

	return { deleted: result.deletedCount, s3_keys: [...audioKeys, ...safeThumbKeys] };
}

export async function countRecordingsByStatus(status: RecordingStatus): Promise<number> {
	const db = await getDb();
	return db.collection('recordings').countDocuments({ status });
}

// ══════════════════════════════════════
//  BROADCAST ADMIN GATE
// ══════════════════════════════════════
// Mirrors the helpers in main src/db/collections.ts. Same collection + shape.

/** Channel-wide YouTube live URL used as the default whenever the admin
 *  hasn't pinned a specific video URL on a broadcast. The public live page
 *  uses this for the "Voir sur YouTube" link before/during a live, since
 *  the actual VOD id isn't known until the live ends. */
export const YOUTUBE_CHANNEL_LIVE_URL = 'https://www.youtube.com/@MissionnaireNetwork/live';

export type BroadcastAdminState = {
	is_live: boolean;
	started_at: string | null;
	ended_at: string | null;
	started_by: string | null;
	started_by_name: string | null;
	icecast_offline_since: string | null;
	notification_pending: boolean;
	title: string | null;
	description: string | null;
	thumbnail_url: string | null;
	thumbnail_s3_key: string | null;
	youtube_url: string | null;
	default_title: string | null;
	default_description: string | null;
	default_thumbnail_url: string | null;
	default_thumbnail_s3_key: string | null;
	default_youtube_url: string | null;
	/** The scheduled_lives entry currently on air (or last aired). Lets the
	 *  public watch page (/live/<slug>) know whether "live right now" is THIS
	 *  entry, and lets the go-live push deep-link to the stable watch URL. */
	scheduled_live_id: string | null;
	scheduled_live_slug: string | null;
	/** Live transcript: SRT copied from the linked scheduled live at go-live.
	 *  anchor = wall-clock ms when SRT 00:00:00 started playing on air (set by
	 *  the admin sync button); offset = manual nudge correction in ms. */
	subtitle_srt_url: string | null;
	subtitle_srt_s3_key: string | null;
	subtitle_anchor_epoch_ms: number | null;
	subtitle_offset_ms: number;
	updated_at: string;
};

const BROADCAST_DEFAULT: BroadcastAdminState = {
	is_live: false,
	started_at: null,
	ended_at: null,
	started_by: null,
	started_by_name: null,
	icecast_offline_since: null,
	notification_pending: false,
	title: null,
	description: null,
	thumbnail_url: null,
	thumbnail_s3_key: null,
	youtube_url: null,
	default_title: null,
	default_description: null,
	default_thumbnail_url: null,
	default_thumbnail_s3_key: null,
	default_youtube_url: null,
	scheduled_live_id: null,
	scheduled_live_slug: null,
	subtitle_srt_url: null,
	subtitle_srt_s3_key: null,
	subtitle_anchor_epoch_ms: null,
	subtitle_offset_ms: 0,
	updated_at: new Date(0).toISOString()
};

// The broadcast doc is read by every layout load (sidebar live indicator),
// every dashboard load, and every recordings page load. It mutates only on
// admin go-live / end-live / metadata edits — all of which call
// setBroadcastAdminState below. A 3-second TTL is short enough that admin
// actions reflect immediately (the action handler invalidates explicitly via
// setBroadcastAdminState) and long enough to coalesce the burst of 2-4 reads
// that happens during a single navigation.
const BROADCAST_TTL_MS = 3_000;
let cachedBroadcast: { value: BroadcastAdminState; cachedAt: number } | null = null;

export async function getBroadcastAdminState(opts?: {
	fresh?: boolean;
}): Promise<BroadcastAdminState> {
	// Mutating handlers (go-live / end-live) gate on `is_live` and must never
	// short-circuit on a stale cache — a stale `is_live: true` would skip the
	// notification_pending write and the push would never fire.
	if (!opts?.fresh && cachedBroadcast && Date.now() - cachedBroadcast.cachedAt < BROADCAST_TTL_MS) {
		return cachedBroadcast.value;
	}
	const db = await getDb();
	const doc = await db
		.collection('broadcast_admin_state')
		.findOne({ _id: 'current' as unknown as ObjectId });
	if (!doc) {
		cachedBroadcast = { value: BROADCAST_DEFAULT, cachedAt: Date.now() };
		return BROADCAST_DEFAULT;
	}
	const value: BroadcastAdminState = {
		is_live: Boolean(doc.is_live),
		started_at: (doc.started_at as string | null) ?? null,
		ended_at: (doc.ended_at as string | null) ?? null,
		started_by: (doc.started_by as string | null) ?? null,
		started_by_name: (doc.started_by_name as string | null) ?? null,
		icecast_offline_since: (doc.icecast_offline_since as string | null) ?? null,
		notification_pending: Boolean(doc.notification_pending),
		title: (doc.title as string | null) ?? null,
		description: (doc.description as string | null) ?? null,
		thumbnail_url: (doc.thumbnail_url as string | null) ?? null,
		thumbnail_s3_key: (doc.thumbnail_s3_key as string | null) ?? null,
		youtube_url: (doc.youtube_url as string | null) ?? null,
		default_title: (doc.default_title as string | null) ?? null,
		default_description: (doc.default_description as string | null) ?? null,
		default_thumbnail_url: (doc.default_thumbnail_url as string | null) ?? null,
		default_thumbnail_s3_key: (doc.default_thumbnail_s3_key as string | null) ?? null,
		default_youtube_url: (doc.default_youtube_url as string | null) ?? null,
		scheduled_live_id: (doc.scheduled_live_id as string | null) ?? null,
		scheduled_live_slug: (doc.scheduled_live_slug as string | null) ?? null,
		subtitle_srt_url: (doc.subtitle_srt_url as string | null) ?? null,
		subtitle_srt_s3_key: (doc.subtitle_srt_s3_key as string | null) ?? null,
		subtitle_anchor_epoch_ms:
			typeof doc.subtitle_anchor_epoch_ms === 'number' ? doc.subtitle_anchor_epoch_ms : null,
		subtitle_offset_ms:
			typeof doc.subtitle_offset_ms === 'number' ? doc.subtitle_offset_ms : 0,
		updated_at: (doc.updated_at as string) ?? new Date(0).toISOString()
	};
	cachedBroadcast = { value, cachedAt: Date.now() };
	return value;
}

export async function setBroadcastAdminState(updates: Partial<BroadcastAdminState>): Promise<void> {
	const db = await getDb();
	await db
		.collection('broadcast_admin_state')
		.updateOne(
			{ _id: 'current' as unknown as ObjectId },
			{ $set: { ...updates, updated_at: new Date().toISOString() } },
			{ upsert: true }
		);
	// Invalidate after the write so a concurrent in-flight read can't refill
	// the cache with the pre-write value.
	cachedBroadcast = null;
}

export async function countPushSubscriptions(): Promise<number> {
	const db = await getDb();
	return db.collection('push_subscriptions').countDocuments({});
}

// ══════════════════════════════════════
//  SCHEDULED LIVES
// ══════════════════════════════════════
// YouTube-style scheduled broadcasts. Each entry owns an immutable random slug
// that backs the public watch URL (/live/<slug>) — shareable from the moment
// the live is scheduled, before it ever starts. The single
// broadcast_admin_state gate doc stays the only source of "on air right now";
// go-live links the gate to one of these entries via scheduled_live_id/slug.

export type ScheduledLiveStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';

export type ScheduledLive = {
	_id: string;
	slug: string;
	title: string;
	description: string | null;
	thumbnail_url: string | null;
	thumbnail_s3_key: string | null;
	scheduled_at: string; // ISO (stored as BSON Date, serialized on read)
	status: ScheduledLiveStatus;
	live_started_at: string | null;
	live_ended_at: string | null;
	recording_id: string | null;
	announce_pending: boolean;
	announced_at: string | null;
	reminder_enabled: boolean;
	reminder_sent_at: string | null;
	/** Pre-made SRT transcript for the broadcast audio (uploaded with the
	 *  schedule). anchor/offset are mirrored here on every sync action so the
	 *  replay can recompute the transcript position after the gate is reused. */
	subtitle_srt_url: string | null;
	subtitle_srt_s3_key: string | null;
	subtitle_filename: string | null;
	subtitle_anchor_epoch_ms: number | null;
	subtitle_offset_ms: number;
	created_by: string | null;
	created_at: string;
	updated_at: string;
};

// Lazy index creation — same no-migration pattern as the recordings indexes
// in main src/lib/server/recordings.ts: createIndex is a no-op when present.
let scheduledLiveIndexesEnsured: Promise<void> | null = null;
async function ensureScheduledLiveIndexes(): Promise<void> {
	if (scheduledLiveIndexesEnsured !== null) return scheduledLiveIndexesEnsured;
	scheduledLiveIndexesEnsured = (async () => {
		try {
			const db = await getDb();
			await db
				.collection('scheduled_lives')
				.createIndex({ slug: 1 }, { unique: true, name: 'slug_unique' });
			await db
				.collection('scheduled_lives')
				.createIndex({ status: 1, scheduled_at: 1 }, { name: 'status_scheduledAt' });
		} catch (err) {
			scheduledLiveIndexesEnsured = null;
			console.error('[scheduled_lives] ensureIndexes failed', err);
		}
	})();
	return scheduledLiveIndexesEnsured;
}

/** 11-char base64url id, same alphabet/length feel as a YouTube video id. */
function generateWatchSlug(): string {
	return randomBytes(8).toString('base64url');
}

export async function createScheduledLive(input: {
	title: string;
	description?: string | null;
	thumbnail_url?: string | null;
	thumbnail_s3_key?: string | null;
	scheduled_at: Date;
	status?: 'scheduled' | 'live';
	live_started_at?: string | null;
	announce?: boolean;
	reminder_enabled?: boolean;
	subtitle_srt_url?: string | null;
	subtitle_srt_s3_key?: string | null;
	subtitle_filename?: string | null;
	created_by?: string | null;
}): Promise<ScheduledLive> {
	await ensureScheduledLiveIndexes();
	const db = await getDb();
	const now = new Date().toISOString();
	// Retry on the (astronomically unlikely) slug collision — the unique index
	// turns a duplicate into a write error instead of a silent overwrite.
	for (let attempt = 0; attempt < 5; attempt++) {
		const doc = {
			slug: generateWatchSlug(),
			title: input.title,
			description: input.description ?? null,
			thumbnail_url: input.thumbnail_url ?? null,
			thumbnail_s3_key: input.thumbnail_s3_key ?? null,
			scheduled_at: input.scheduled_at,
			status: input.status ?? 'scheduled',
			live_started_at: input.live_started_at ?? null,
			live_ended_at: null,
			recording_id: null,
			announce_pending: Boolean(input.announce),
			announced_at: null,
			reminder_enabled: Boolean(input.reminder_enabled),
			reminder_sent_at: null,
			subtitle_srt_url: input.subtitle_srt_url ?? null,
			subtitle_srt_s3_key: input.subtitle_srt_s3_key ?? null,
			subtitle_filename: input.subtitle_filename ?? null,
			subtitle_anchor_epoch_ms: null,
			subtitle_offset_ms: 0,
			created_by: input.created_by ?? null,
			created_at: now,
			updated_at: now
		};
		try {
			const result = await db.collection('scheduled_lives').insertOne(doc);
			return serializeDocument<ScheduledLive>({ ...doc, _id: result.insertedId });
		} catch (err) {
			const isDuplicate = (err as { code?: number })?.code === 11000;
			if (!isDuplicate || attempt === 4) throw err;
		}
	}
	throw new Error('unreachable');
}

export async function getScheduledLiveById(id: string): Promise<ScheduledLive | null> {
	if (!ObjectId.isValid(id)) return null;
	const db = await getDb();
	const doc = await db.collection('scheduled_lives').findOne({ _id: new ObjectId(id) });
	return doc ? serializeDocument<ScheduledLive>(doc) : null;
}

export async function listScheduledLives(
	options: { statuses?: ScheduledLiveStatus[]; limit?: number; ascending?: boolean } = {}
): Promise<ScheduledLive[]> {
	const { statuses, limit = 50, ascending = true } = options;
	await ensureScheduledLiveIndexes();
	const db = await getDb();
	const query: Filter<Document> = statuses?.length ? { status: { $in: statuses } } : {};
	const docs = await db
		.collection('scheduled_lives')
		.find(query)
		.sort({ scheduled_at: ascending ? 1 : -1 })
		.limit(limit)
		.toArray();
	return docs.map((doc) => serializeDocument<ScheduledLive>(doc));
}

export async function updateScheduledLive(
	id: string,
	updates: Partial<{
		title: string;
		description: string | null;
		thumbnail_url: string | null;
		thumbnail_s3_key: string | null;
		scheduled_at: Date;
		announce_pending: boolean;
		reminder_enabled: boolean;
		subtitle_srt_url: string | null;
		subtitle_srt_s3_key: string | null;
		subtitle_filename: string | null;
		subtitle_anchor_epoch_ms: number | null;
		subtitle_offset_ms: number;
	}>
): Promise<boolean> {
	if (!ObjectId.isValid(id)) return false;
	const db = await getDb();
	const result = await db
		.collection('scheduled_lives')
		.updateOne(
			{ _id: new ObjectId(id) },
			{ $set: { ...updates, updated_at: new Date().toISOString() } }
		);
	return result.matchedCount > 0;
}

export async function setScheduledLiveStatus(
	id: string,
	status: ScheduledLiveStatus,
	extra: Partial<{ live_started_at: string; live_ended_at: string; recording_id: string }> = {}
): Promise<boolean> {
	if (!ObjectId.isValid(id)) return false;
	const db = await getDb();
	const result = await db
		.collection('scheduled_lives')
		.updateOne(
			{ _id: new ObjectId(id) },
			{ $set: { status, ...extra, updated_at: new Date().toISOString() } }
		);
	return result.matchedCount > 0;
}

export async function deleteScheduledLive(
	id: string
): Promise<{ thumbnail_s3_key: string | null; subtitle_srt_s3_key: string | null } | null> {
	if (!ObjectId.isValid(id)) return null;
	const db = await getDb();
	const doc = await db.collection('scheduled_lives').findOne({ _id: new ObjectId(id) });
	if (!doc) return null;
	await db.collection('scheduled_lives').deleteOne({ _id: new ObjectId(id) });
	return {
		thumbnail_s3_key: (doc.thumbnail_s3_key as string | null | undefined) ?? null,
		subtitle_srt_s3_key: (doc.subtitle_srt_s3_key as string | null | undefined) ?? null
	};
}

/** The scheduled entry an ad-hoc "Aller en direct" should attach to: the
 *  nearest still-`scheduled` doc whose slot is within [now − 1h, now + 6h].
 *  Wide on purpose — admins routinely start a bit early or late. The go-live
 *  confirm dialog shows which entry will be linked so a mis-link is visible. */
export async function findLinkableScheduledLive(now: Date = new Date()): Promise<ScheduledLive | null> {
	await ensureScheduledLiveIndexes();
	const db = await getDb();
	const from = new Date(now.getTime() - 60 * 60 * 1000);
	const to = new Date(now.getTime() + 6 * 60 * 60 * 1000);
	const docs = await db
		.collection('scheduled_lives')
		.find({ status: 'scheduled', scheduled_at: { $gte: from, $lte: to } })
		.sort({ scheduled_at: 1 })
		.limit(10)
		.toArray();
	if (docs.length === 0) return null;
	let best = docs[0];
	let bestDist = Infinity;
	for (const doc of docs) {
		const ms = doc.scheduled_at instanceof Date ? doc.scheduled_at.getTime() : Date.parse(String(doc.scheduled_at));
		const dist = Math.abs(ms - now.getTime());
		if (dist < bestDist) {
			bestDist = dist;
			best = doc;
		}
	}
	return serializeDocument<ScheduledLive>(best);
}
