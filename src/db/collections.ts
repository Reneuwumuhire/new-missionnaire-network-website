import { getDb } from './mongo';
import { availableTypesTag } from '../utils/data';
import { ObjectId, MongoServerError, type Document, type Filter, type Sort } from 'mongodb';
import type { YoutubeVideo } from '$lib/models/youtube';
import type { AudioAsset } from '$lib/models/media-assets';
import type { MusicAudio } from '$lib/models/music-audio';
import type { Sermon } from '$lib/models/sermon';
import type { Literature } from '$lib/models/literature';

const titleDateSortExpression = {
	$switch: {
		branches: [
			{
				case: {
					$regexMatch: {
						input: { $ifNull: ['$title', ''] },
						regex: /^\d{4}-\d{2}-\d{2} \d{2}h\d{2}/
					}
				},
				then: {
					$dateFromString: {
						dateString: { $substrBytes: ['$title', 0, 16] },
						format: '%Y-%m-%d %Hh%M',
						timezone: 'Africa/Kigali',
						onError: null,
						onNull: null
					}
				}
			},
			{
				case: {
					$regexMatch: {
						input: { $ifNull: ['$title', ''] },
						regex: /^\d{4}-\d{2}-\d{2}/
					}
				},
				then: {
					$dateFromString: {
						dateString: { $substrBytes: ['$title', 0, 10] },
						format: '%Y-%m-%d',
						timezone: 'Africa/Kigali',
						onError: null,
						onNull: null
					}
				}
			}
		],
		default: null
	}
} as const;

const releaseTimestampSortExpression = {
	$cond: [
		{ $ne: ['$release_timestamp', null] },
		{ $toDate: { $multiply: ['$release_timestamp', 1000] } },
		null
	]
} as const;

export async function getCollection(
	collection_name: string,
	skip: number,
	limit: number,
	filter?: string,
	search?: string
): Promise<YoutubeVideo[]> {
	console.log('[DB] Starting query with params:', { collection_name, skip, limit, filter, search });

	try {
		const db = await getDb();
		const query: Filter<Document> = {};
		const conditions: Filter<Document>[] = [];

		// Add search condition if provided
		if (search?.trim()) {
			conditions.push({
				$or: [
					{ title: { $regex: search, $options: 'i' } },
					{ description: { $regex: search, $options: 'i' } }
				]
			});
		}

		// Add filter condition if provided and not 'All'
		if (filter && filter !== 'All') {
			const tagConfig = availableTypesTag.find((tag) => tag.label === filter);
			console.log('[DB] Tag config for filter:', tagConfig);

			if (tagConfig) {
				const regexPatterns = tagConfig.value.map((value) => new RegExp(`^${value}$`, 'i'));
				conditions.push({
					tags: { $in: regexPatterns }
				});
			}
		}

		// Combine conditions if they exist
		if (conditions.length > 0) {
			query.$and = conditions;
		}

		console.log('[DB] Final query:', JSON.stringify(query, null, 2));

		let data;
		if (collection_name === 'videos') {
			// Homepage cards lead with an event date in the title, which should win over upload time.
			data = await db
				.collection(collection_name)
				.aggregate([
					{ $match: query },
					{
						$addFields: {
							titleSortDate: titleDateSortExpression,
							releaseTimestampSortDate: releaseTimestampSortExpression
						}
					},
					{
						$addFields: {
							sortDate: {
								$ifNull: ['$titleSortDate', { $ifNull: ['$publishedAt', '$releaseTimestampSortDate'] }]
							}
						}
					},
					{ $sort: { sortDate: -1, release_timestamp: -1, _id: -1 } },
					{ $skip: skip },
					{ $limit: limit },
					{ $project: { titleSortDate: 0, releaseTimestampSortDate: 0, sortDate: 0 } }
				])
				.toArray();
		} else {
			// Let MongoDB handle sorting and pagination
			data = await db
				.collection(collection_name)
				.find(query)
				.sort({ release_timestamp: -1 }) // Sort in MongoDB instead of in memory
				.skip(skip)
				.limit(limit)
				.toArray();
		}

		console.log(`[DB] Found ${data.length} documents`);

		// Convert MongoDB documents to plain objects and stringify all ObjectIds recursively
		return data.map((doc) => serializeDocument<YoutubeVideo>(doc));
	} catch (error) {
		console.error('[DB] Error in getCollection:', error);
		throw error;
	}
}

export async function getLiveVideos(): Promise<YoutubeVideo[]> {
	try {
		const db = await getDb();
		// Try 'videos' collection first, looking for live_status 'live'
		let data = await db
			.collection('videos')
			.find({ live_status: 'live' })
			.sort({ timestamp: -1 })
			.toArray();

		if (data.length === 0) {
			// Fallback: look for generic livestream collection if it exists
			try {
				data = await db.collection('livestream').find({}).toArray();
			} catch (e) {
				console.warn('[DB] Fallback collection "livestream" not found or error accessing it:', e);
			}
		}

		return data.map((doc) => serializeDocument<YoutubeVideo>(doc));
	} catch (error) {
		console.error('[DB] Error in getLiveVideos:', error);
		throw error;
	}
}

export async function getUpcomingVideos(limit = 20): Promise<YoutubeVideo[]> {
	try {
		const db = await getDb();
		const data = await db
			.collection('videos')
			.find({ liveBroadcastContent: 'upcoming' })
			.sort({ scheduledStartTime: 1 })
			.limit(limit)
			.toArray();

		return data.map((doc) => serializeDocument<YoutubeVideo>(doc));
	} catch (error) {
		console.error('[DB] Error in getUpcomingVideos:', error);
		throw error;
	}
}

export async function getVideosByDuration(options: {
	minDuration?: number;
	maxDuration?: number;
	limit?: number;
	skip?: number;
}): Promise<YoutubeVideo[]> {
	const { minDuration, maxDuration, limit = 20, skip = 0 } = options;
	try {
		const db = await getDb();
		const query: Filter<Document> = {};

		if (minDuration !== undefined || maxDuration !== undefined) {
			const dur: Filter<Document> = {};
			if (minDuration !== undefined) dur.$gte = minDuration;
			if (maxDuration !== undefined) dur.$lte = maxDuration;
			query.duration = dur;
		}

		const data = await db
			.collection('videos')
			.find(query)
			.sort({ release_timestamp: -1 })
			.skip(skip)
			.limit(limit)
			.toArray();

		return data.map((doc) => serializeDocument<YoutubeVideo>(doc));
	} catch (error) {
		console.error('[DB] Error in getVideosByDuration:', error);
		throw error;
	}
}

export async function getVideosWithAudio(options: {
	limit?: number;
	skip?: number;
	maxDuration?: number;
	minDuration?: number;
}): Promise<YoutubeVideo[]> {
	const { limit = 20, skip = 0, maxDuration, minDuration } = options;
	try {
		const db = await getDb();
		const query: Filter<Document> = { audioFiles: { $exists: true, $ne: null } };

		if (maxDuration !== undefined || minDuration !== undefined) {
			const dur: Filter<Document> = {};
			if (maxDuration !== undefined) dur.$lte = maxDuration;
			if (minDuration !== undefined) dur.$gte = minDuration;
			query.duration = dur;
		}

		const data = await db
			.collection('videos')
			.find(query)
			.sort({ release_timestamp: -1 })
			.skip(skip)
			.limit(limit)
			.toArray();

		return data.map((doc) => serializeDocument<YoutubeVideo>(doc));
	} catch (error) {
		console.error('[DB] Error in getVideosWithAudio:', error);
		throw error;
	}
}

export async function queryVideos(options: {
	searchTags?: string[];
	limit?: number;
	pageNumber?: number;
	startDate?: Date;
	endDate?: Date;
	orderBy?: string;
}): Promise<YoutubeVideo[]> {
	const {
		searchTags = ['any'],
		limit = 20,
		pageNumber = 1,
		startDate,
		endDate,
		orderBy = 'release_timestamp:desc'
	} = options;

	try {
		const db = await getDb();
		const query: Filter<Document> = {};

		if (searchTags && searchTags.length > 0 && !searchTags.includes('any')) {
			const regexPatterns = searchTags.map((tag) => new RegExp(`^${tag}$`, 'i'));
			query.tags = { $in: regexPatterns };
		}

		if (startDate || endDate) {
			query.publishedAt = {};
			if (startDate) query.publishedAt.$gte = startDate;
			if (endDate) query.publishedAt.$lte = endDate;
		}

		const [property, order] = orderBy.split(/[: ,]/);
		const sort: Sort = {};
		sort[property] = order === 'asc' ? 1 : -1;

		const skip = (pageNumber - 1) * limit;

		const data = await db
			.collection('videos')
			.find(query)
			.sort(sort)
			.skip(skip)
			.limit(limit)
			.toArray();

		return data.map((doc) => serializeDocument<YoutubeVideo>(doc));
	} catch (error) {
		console.error('[DB] Error in queryVideos:', error);
		throw error;
	}
}

export async function queryAudios(options: {
	searchTags?: string[];
	limit?: number;
	pageNumber?: number;
	startDate?: Date;
	endDate?: Date;
	orderBy?: string;
}): Promise<AudioAsset[]> {
	const {
		searchTags = ['any'],
		limit = 20,
		pageNumber = 1,
		startDate,
		endDate,
		orderBy = 'release_timestamp:desc'
	} = options;

	try {
		const db = await getDb();
		const query: Filter<Document> = {};

		if (searchTags && searchTags.length > 0 && !searchTags.includes('any')) {
			const regexPatterns = searchTags.map((tag) => new RegExp(`^${tag}$`, 'i'));
			query.tags = { $in: regexPatterns };
		}

		if (startDate || endDate) {
			query.releaseDate = {};
			if (startDate) query.releaseDate.$gte = startDate;
			if (endDate) query.releaseDate.$lte = endDate;
		}

		const [property, order] = orderBy.split(/[: ,]/);
		const sort: Sort = {};
		sort[property] = order === 'asc' ? 1 : -1;

		const skip = (pageNumber - 1) * limit;

		const data = await db
			.collection('AUDIO_ASSETS')
			.find(query)
			.sort(sort)
			.skip(skip)
			.limit(limit)
			.toArray();

		return data.map((doc) => serializeDocument<AudioAsset>(doc));
	} catch (error) {
		console.error('[DB] Error in queryAudios:', error);
		throw error;
	}
}

// Map base characters to regex alternation that matches accented variants
// Uses alternation (a|à|â) instead of character classes to avoid issues
// with multi-byte characters in MongoDB's regex engine
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

// Optional combining accent mark — consumes any Unicode combining diacritical
// that may follow a base letter in decomposed (NFD) storage
const OPT_COMBINING = '[\u0300-\u036f]?';

function buildFuzzySearchPattern(search: string): string {
	// Normalize: strip accents to get base characters, then build a regex
	// where each letter matches its accented variants (composed)
	// AND tolerates decomposed storage (base + combining mark)
	const normalized = search.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

	let pattern = '';
	for (const char of normalized) {
		const lower = char.toLowerCase();
		if (lower in ACCENT_MAP) {
			// Match composed accented char OR base letter + optional combining mark
			pattern += '(?:' + ACCENT_MAP[lower].join('|') + ')' + OPT_COMBINING;
		} else if (/[a-z]/i.test(char)) {
			// Regular letter — still may have an unexpected combining mark after it
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

export async function queryMusicAudio(options: {
	category?: string;
	search?: string;
	alpha?: string;
	artist?: string;
	number?: number;
	limit?: number;
	pageNumber?: number;
	orderBy?: string;
}): Promise<{ data: MusicAudio[]; total: number }> {
	const {
		category,
		search,
		alpha,
		artist,
		number,
		limit = 20,
		pageNumber = 1,
		orderBy = 'uploaded_at:desc'
	} = options;

	try {
		const db = await getDb();
		const query: Filter<Document> = {};
		const conditions: Filter<Document>[] = [];

		if (category && category !== 'All') {
			conditions.push({ category: category });
		}

		if (search && search.trim()) {
			const searchPattern = buildFuzzySearchPattern(search.trim());
			const fields = ['title', 'book_full_name', 'artist'];
			const searchConditions: Filter<Document>[] = [];
			for (const field of fields) {
				searchConditions.push({ [field]: { $regex: searchPattern, $options: 'i' } });
			}
			// Also search with plain escaped term for exact substring match (in case regex char classes fail)
			const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			for (const field of fields) {
				searchConditions.push({ [field]: { $regex: escaped, $options: 'i' } });
			}
			conditions.push({ $or: searchConditions });
		}

		if (alpha && alpha.length === 1) {
			conditions.push({ title: { $regex: `^${alpha}`, $options: 'i' } });
		}

		if (artist) {
			conditions.push({ artist: artist });
		}

		if (number !== undefined && number !== null) {
			conditions.push({ number: number });
		}

		if (conditions.length > 0) {
			query.$and = conditions;
		}

		const skip = (pageNumber - 1) * limit;
		const total = await db.collection('music_audio').countDocuments(query, {
			collation: { locale: 'fr', strength: 1 }
		});

		const [property, order] = orderBy.split(/[: ,]/);

		let data;
		if (property === 'random') {
			data = await db
				.collection('music_audio')
				.aggregate([{ $match: query }, { $sample: { size: limit } }])
				.toArray();
		} else {
			const sort: Sort = {};
			sort[property] = order === 'asc' ? 1 : -1;
			data = await db
				.collection('music_audio')
				.find(query)
				.sort(sort)
				.collation({ locale: 'fr', numericOrdering: true })
				.skip(skip)
				.limit(limit)
				.toArray();
		}

		return {
			data: data.map((doc) => serializeDocument<MusicAudio>(doc)),
			total
		};
	} catch (error) {
		console.error('[DB] Error in queryMusicAudio:', error);
		throw error;
	}
}

export async function getMusicArtists(): Promise<string[]> {
	try {
		const db = await getDb();
		// Get unique artists that are not null or empty
		const artists = await db.collection('music_audio').distinct('artist', {
			artist: { $ne: null, $nin: ['', undefined] }
		});

		return (artists as string[])
			.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
			.sort((a, b) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' }));
	} catch (error) {
		console.error('[DB] Error in getMusicArtists:', error);
		throw error;
	}
}

export async function getVideoById(videoId: string): Promise<YoutubeVideo | null> {
	try {
		const db = await getDb();
		const collection = db.collection('videos');

		// Try matching by `id` field first (YouTube video ID), then by `_id`
		let doc = await collection.findOne({ id: videoId });
		if (!doc && ObjectId.isValid(videoId)) {
			doc = await collection.findOne({ _id: new ObjectId(videoId) });
		}

		return doc ? serializeDocument<YoutubeVideo>(doc) : null;
	} catch (error) {
		console.error('[DB] Error in getVideoById:', error);
		return null;
	}
}

// ── Push Subscription helpers ─────────────────────────────────────

export interface PushSubscriptionRecord {
	endpoint: string;
	keys: { p256dh: string; auth: string };
	createdAt: Date;
	userAgent?: string;
}

export async function savePushSubscription(
	subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
	userAgent?: string
): Promise<void> {
	const db = await getDb();
	const col = db.collection('push_subscriptions');
	await col.updateOne(
		{ endpoint: subscription.endpoint },
		{
			$set: {
				keys: subscription.keys,
				userAgent: userAgent ?? null,
				createdAt: new Date()
			}
		},
		{ upsert: true }
	);
}

export async function removePushSubscription(endpoint: string): Promise<void> {
	const db = await getDb();
	const col = db.collection('push_subscriptions');
	await col.deleteOne({ endpoint });
}

export async function getAllPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
	const db = await getDb();
	const col = db.collection<PushSubscriptionRecord>('push_subscriptions');
	return col.find({}).toArray();
}

// ── Notification dedup helpers ───────────────────────────────────

let lockIndexEnsured = false;

async function ensureLockIndex() {
	if (lockIndexEnsured) return;
	try {
		const db = await getDb();
		const col = db.collection('notification_locks');
		// Drop duplicate documents first — keep only the most recent per type
		const pipeline = [
			{ $sort: { lastSentAt: -1 } },
			{
				$group: {
					_id: '$type',
					keepId: { $first: '$_id' },
					allIds: { $push: '$_id' }
				}
			},
			{ $project: { removeIds: { $slice: ['$allIds', 1, { $size: '$allIds' }] } } }
		];
		const dupes = await col.aggregate(pipeline).toArray();
		for (const dupe of dupes) {
			if (dupe.removeIds.length > 0) {
				await col.deleteMany({ _id: { $in: dupe.removeIds } });
				console.log(`[NotifLock] Cleaned ${dupe.removeIds.length} duplicate(s) for type "${dupe._id}"`);
			}
		}
		await col.createIndex({ type: 1 }, { unique: true });
		lockIndexEnsured = true;
	} catch (e: unknown) {
		// If index creation fails due to existing duplicates, drop and recreate
		if (e instanceof MongoServerError && (e.code === 11000 || e.codeName === 'DuplicateKey')) {
			const db = await getDb();
			await db.collection('notification_locks').dropIndexes();
			await db.collection('notification_locks').createIndex({ type: 1 }, { unique: true });
			lockIndexEnsured = true;
		} else {
			console.error('[NotifLock] Index setup error:', e);
		}
	}
}

/**
 * Check whether a push notification of the given type was sent recently.
 * Returns true if it's safe to send (i.e. cooldown has elapsed).
 * Uses a unique index on `type` + atomic findOneAndUpdate so that
 * only one serverless instance can win the race, even across cold starts.
 */
export async function claimNotificationSlot(
	type: string,
	cooldownMs: number
): Promise<boolean> {
	await ensureLockIndex();

	const db = await getDb();
	const col = db.collection('notification_locks');
	const now = Date.now();

	try {
		const result = await col.findOneAndUpdate(
			{
				type,
				$or: [
					{ lastSentAt: { $exists: false } },
					{ lastSentAt: { $lt: now - cooldownMs } }
				]
			},
			{ $set: { lastSentAt: now } },
			{ upsert: true, returnDocument: 'after' }
		);

		return result !== null;
	} catch (e: unknown) {
		// Duplicate key error → another instance already claimed the slot
		if (e instanceof MongoServerError && e.code === 11000) return false;
		console.error('[NotifLock] claimNotificationSlot error:', e);
		// On unexpected errors, allow sending to avoid silent notification blackout
		return true;
	}
}

// ── Notification event tracking ──────────────────────────────────

export async function trackNotificationEvent(event: {
	action: string;
	tag: string;
	timestamp: number;
}): Promise<void> {
	const db = await getDb();
	const col = db.collection('notification_events');
	await col.insertOne({
		action: event.action,
		tag: event.tag,
		timestamp: event.timestamp,
		createdAt: new Date()
	});
}

// ── Live radio listener tracking ────────────────────────────────

const LISTENER_TTL_MS = 25_000; // Consider a listener gone after 25s without heartbeat (accommodates 10s poll interval)

export async function heartbeatListener(listenerId: string): Promise<void> {
	const db = await getDb();
	const col = db.collection('radio_listeners');
	await col.updateOne(
		{ _id: listenerId as unknown as ObjectId },
		{ $set: { lastSeen: Date.now() } },
		{ upsert: true }
	);
}

export async function removeListener(listenerId: string): Promise<void> {
	const db = await getDb();
	const col = db.collection('radio_listeners');
	await col.deleteOne({ _id: listenerId as unknown as ObjectId });
}

export async function countActiveListeners(): Promise<number> {
	const db = await getDb();
	const col = db.collection('radio_listeners');
	const cutoff = Date.now() - LISTENER_TTL_MS;
	return col.countDocuments({ lastSeen: { $gt: cutoff } });
}

// ── Shared check-slot lock (YouTube & Radio) ───────────────────

/**
 * Atomic DB-level throttle that works across serverless instances.
 * Returns `true` if the caller should proceed with the check (slot claimed).
 * Returns `false` if another instance already checked recently.
 *
 * On DB errors, returns `true` to avoid silently skipping checks.
 */
export async function claimCheckSlot(type: string, intervalMs: number): Promise<boolean> {
	try {
		const db = await getDb();
		const col = db.collection('check_locks');
		const now = Date.now();

		const result = await col.findOneAndUpdate(
			{
				type,
				$or: [
					{ lastCheckAt: { $exists: false } },
					{ lastCheckAt: { $lt: now - intervalMs } }
				]
			},
			{ $set: { lastCheckAt: now } },
			{ upsert: true, returnDocument: 'after' }
		);

		return result !== null;
	} catch (e: unknown) {
		if (e instanceof MongoServerError && e.code === 11000) return false;
		console.error('[CheckLock] claimCheckSlot error:', e);
		return true;
	}
}

// ── YouTube live status cache ──────────────────────────────────

export type YouTubeCachedStatus = {
	isLive: boolean;
	videoId: string | null;
	title: string | null;
	description: string | null;
	thumbnail: string | null;
	duration: number;
	url: string | null;
	updatedAt: string | null;
};

export async function getYouTubeCachedStatus(): Promise<YouTubeCachedStatus | null> {
	try {
		const db = await getDb();
		const doc = await db.collection('youtube_live_cache').findOne({ _id: 'current' as unknown as ObjectId });
		if (!doc) return null;
		return {
			isLive: doc.isLive,
			videoId: doc.videoId,
			title: doc.title,
			description: doc.description,
			thumbnail: doc.thumbnail,
			duration: doc.duration,
			url: doc.url,
			updatedAt: doc.updatedAt
		};
	} catch (e) {
		console.error('[YouTubeCache] getYouTubeCachedStatus error:', e);
		return null;
	}
}

export async function setYouTubeCachedStatus(status: YouTubeCachedStatus): Promise<void> {
	try {
		const db = await getDb();
		await db.collection('youtube_live_cache').updateOne(
			{ _id: 'current' as unknown as ObjectId },
			{ $set: { ...status } },
			{ upsert: true }
		);
	} catch (e) {
		console.error('[YouTubeCache] setYouTubeCachedStatus error:', e);
	}
}

// ── Radio status cache ─────────────────────────────────────────

export type RadioCachedStatus = {
	isLive: boolean;
	checkedAt: string;
	streamUrl?: string;
};

export async function getRadioCachedStatus(): Promise<RadioCachedStatus | null> {
	try {
		const db = await getDb();
		const doc = await db.collection('radio_status_cache').findOne({ _id: 'current' as unknown as ObjectId });
		if (!doc) return null;
		return {
			isLive: doc.isLive,
			checkedAt: doc.checkedAt,
			streamUrl: doc.streamUrl
		};
	} catch (e) {
		console.error('[RadioCache] getRadioCachedStatus error:', e);
		return null;
	}
}

export async function setRadioCachedStatus(status: RadioCachedStatus): Promise<void> {
	try {
		const db = await getDb();
		await db.collection('radio_status_cache').updateOne(
			{ _id: 'current' as unknown as ObjectId },
			{ $set: { ...status } },
			{ upsert: true }
		);
	} catch (e) {
		console.error('[RadioCache] setRadioCachedStatus error:', e);
	}
}

/**
 * Recursively serializes a MongoDB document, converting all ObjectIds to strings
 * and ensuring the document is fully serializable for SvelteKit data loading.
 *
 * @param doc The document or value to serialize
 * @returns A serialized version of the document with all ObjectIds converted to strings
 */
function serializeDocument<T = unknown>(doc: unknown): T {
	if (doc == null) {
		return doc as T;
	}

	if (doc instanceof ObjectId) {
		return doc.toString() as T;
	}

	if (doc instanceof Date) {
		return doc.toISOString() as T;
	}

	if (Array.isArray(doc)) {
		return doc.map((item) => serializeDocument(item)) as T;
	}

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

export async function getSongs(options: {
	limit?: number;
	skip?: number;
	search?: string;
}): Promise<YoutubeVideo[]> {
	const { limit = 20, skip = 0, search } = options;
	try {
		const db = await getDb();
		const query: Filter<Document> = {};

		if (search?.trim()) {
			query.$or = [
				{ title: { $regex: search, $options: 'i' } },
				{ description: { $regex: search, $options: 'i' } }
			];
		}

		const data = await db
			.collection('songs')
			.find(query)
			.sort({ release_timestamp: -1 })
			.skip(skip)
			.limit(limit)
			.toArray();

		return data.map((doc) => serializeDocument<YoutubeVideo>(doc));
	} catch (error) {
		console.error('[DB] Error in getSongs:', error);
		throw error;
	}
}

export async function getSongsCount(search?: string): Promise<number> {
	try {
		const db = await getDb();
		const query: Filter<Document> = {};

		if (search?.trim()) {
			query.$or = [
				{ title: { $regex: search, $options: 'i' } },
				{ description: { $regex: search, $options: 'i' } }
			];
		}

		return await db.collection('songs').countDocuments(query);
	} catch (error) {
		console.error('[DB] Error in getSongsCount:', error);
		throw error;
	}
}

export async function querySermons(options: {
	author?: string;
	search?: string;
	alpha?: string;
	year?: string;
	hasAudio?: boolean;
	limit?: number;
	pageNumber?: number;
	orderBy?: string;
	language?: string;
}): Promise<{ data: Sermon[]; total: number }> {
	const {
		author,
		search,
		alpha,
		year,
		hasAudio = false,
		limit = 100,
		pageNumber = 1,
		orderBy = 'iso_date:desc',
		language = 'french'
	} = options;

	try {
		const db = await getDb();
		const query: Filter<Document> = {};
		const conditions: Filter<Document>[] = [];

		if (author && author !== 'All' && author !== 'Tous') {
			conditions.push({ author: author });
		}

		if (search && search.trim()) {
			conditions.push({
				$or: [
					{ english_title: { $regex: search, $options: 'i' } },
					{ french_title: { $regex: search, $options: 'i' } },
					{ full_date_code: { $regex: search, $options: 'i' } }
				]
			});
		}

		if (alpha && alpha.length === 1) {
			conditions.push({ french_title: { $regex: `^${alpha}`, $options: 'i' } });
		}

		if (year) {
			conditions.push({ iso_date: { $regex: `^${year}` } });
		}

		if (hasAudio) {
			if (language === 'english') {
				conditions.push({ english_audio_url: { $regex: '.+' } });
			} else {
				conditions.push({ mp3_url: { $regex: '.+' } });
			}
		}

		// Language filtering logic
		if (language === 'english') {
			// For English, we specifically want items with english_audio_url OR english_pdf_url
			// (User requested to hide entry if no audio/pdf is available)
			conditions.push({
				$or: [{ english_pdf_url: { $regex: '.+' } }, { english_audio_url: { $regex: '.+' } }]
			});
		}
		// For French (default), we show everything unless specifically filtered out,
		// but typically the default view is the "French" view.
		// If we wanted to be strict about "French only", we could check for french_title,
		// but traditionally the main collection is French.

		if (conditions.length > 0) {
			query.$and = conditions;
		}

		const skip = (pageNumber - 1) * limit;
		const total = await db.collection('sermons').countDocuments(query);

		const [property, order] = orderBy.split(/[: ,]/);
		const sort: Sort = {};
		sort[property] = order === 'asc' ? 1 : -1;

		const data = await db
			.collection('sermons')
			.find(query)
			.sort(sort)
			.skip(skip)
			.limit(limit)
			.toArray();

		return {
			data: data.map((doc) => serializeDocument<Sermon>(doc)),
			total
		};
	} catch (error) {
		console.error('[DB] Error in querySermons:', error);
		throw error;
	}
}

export async function getSermonYears(): Promise<string[]> {
	try {
		const db = await getDb();
		const dates = await db.collection('sermons').distinct('iso_date', {
			iso_date: { $ne: null, $nin: ['', undefined] }
		});

		const years = new Set<string>();
		(dates as string[]).forEach((date) => {
			if (date && date.length >= 4) {
				years.add(date.substring(0, 4));
			}
		});

		return Array.from(years).sort((a, b) => b.localeCompare(a));
	} catch (error) {
		console.error('[DB] Error in getSermonYears:', error);
		throw error;
	}
}

export async function queryLiterature(options: {
	author?: string;
	search?: string;
	type?: string;
	language?: string;
	source?: string;
	limit?: number;
	pageNumber?: number;
	orderBy?: string;
}): Promise<{ data: Literature[]; total: number }> {
	const {
		author,
		search,
		type,
		language,
		source,
		limit = 20,
		pageNumber = 1,
		orderBy = 'release_date:desc'
	} = options;

	try {
		const db = await getDb();
		const query: Filter<Document> = {};
		const conditions: Filter<Document>[] = [];

		if (author && author !== 'All' && author !== 'Tous') {
			conditions.push({ author: author });
		}

		if (type && type !== 'All' && type !== 'Tous' && type !== 'Tout') {
			conditions.push({ type: { $regex: new RegExp(`^${type}$`, 'i') } });
		}

		if (search && search.trim()) {
			conditions.push({
				$or: [{ title: { $regex: search, $options: 'i' } }]
			});
		}

		if (source && source !== 'All' && source !== 'Tous' && source !== 'Tout') {
			conditions.push({ source: source });
		}

		if (language && language !== 'All') {
			if (language === 'french') {
				conditions.push({
					$or: [{ language: 'french' }, { language: { $exists: false } }]
				});
			} else {
				conditions.push({ language: language });
			}
		}

		if (conditions.length > 0) {
			query.$and = conditions;
		}

		const skip = (pageNumber - 1) * limit;
		const total = await db.collection('literature').countDocuments(query);

		const [property, order] = orderBy.split(/[: ,]/);
		const sort: Sort = {};
		sort[property] = order === 'asc' ? 1 : -1;

		const data = await db
			.collection('literature')
			.find(query)
			.sort(sort)
			.skip(skip)
			.limit(limit)
			.toArray();

		return {
			data: data.map((doc) => serializeDocument<Literature>(doc)),
			total
		};
	} catch (error) {
		console.error('[DB] Error in queryLiterature:', error);
		throw error;
	}
}
