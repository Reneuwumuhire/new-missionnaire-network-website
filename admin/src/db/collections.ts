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
	limit?: number;
	pageNumber?: number;
	orderBy?: string;
}): Promise<{ data: MusicAudio[]; total: number }> {
	const {
		category,
		search,
		artist,
		limit = 20,
		pageNumber = 1,
		orderBy = 'uploaded_at:desc'
	} = options;

	const db = await getDb();
	const conditions: Filter<Document>[] = [];

	if (category && category !== 'All') {
		conditions.push({ category });
	}

	if (search && search.trim()) {
		const searchPattern = buildFuzzySearchPattern(search.trim());
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
	const value = categories
		.filter((c): c is string => typeof c === 'string' && c.length > 0)
		.sort();
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

export async function updateRecording(
	id: string,
	updates: Partial<{
		title: string;
		published: boolean;
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

/** Bulk-delete recordings and return every S3 key (mp3 + thumbnail) the caller
 *  should purge from object storage. DB rows are removed atomically; S3 cleanup
 *  happens in the route handler so a partial S3 failure can be logged without
 *  leaving orphan DB rows. */
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
	const s3_keys: string[] = [];
	for (const d of docs) {
		const s3Key = d.s3_key as string | null | undefined;
		const thumbKey = d.thumbnail_s3_key as string | null | undefined;
		if (s3Key) s3_keys.push(s3Key);
		if (thumbKey) s3_keys.push(thumbKey);
	}
	const result = await db.collection('recordings').deleteMany({ _id: { $in: objectIds } });
	return { deleted: result.deletedCount, s3_keys };
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
