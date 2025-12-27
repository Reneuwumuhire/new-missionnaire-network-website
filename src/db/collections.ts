import { getDb } from './mongo';
import { availableTypesTag } from '../utils/data';
import { ObjectId } from 'mongodb';
import type { YoutubeVideo } from '$lib/models/youtube';
import type { AudioAsset } from '$lib/models/media-assets';
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
		const query: Record<string, any> = {};
		const conditions: Record<string, any>[] = [];

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

		// Let MongoDB handle sorting and pagination
		const data = await db
			.collection(collection_name)
			.find(query)
			.sort({ release_timestamp: -1 }) // Sort in MongoDB instead of in memory
			.skip(skip)
			.limit(limit)
			.toArray();

		console.log(`[DB] Found ${data.length} documents`);

		// Convert MongoDB documents to plain objects and stringify all ObjectIds recursively
		return data.map((doc) => serializeDocument(doc));
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

		return data.map((doc) => serializeDocument(doc));
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

		return data.map((doc) => serializeDocument(doc));
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
		const query: Record<string, any> = {};

		if (minDuration !== undefined || maxDuration !== undefined) {
			query.duration = {};
			if (minDuration !== undefined) query.duration.$gte = minDuration;
			if (maxDuration !== undefined) query.duration.$lte = maxDuration;
		}

		const data = await db
			.collection('videos')
			.find(query)
			.sort({ release_timestamp: -1 })
			.skip(skip)
			.limit(limit)
			.toArray();

		return data.map((doc) => serializeDocument(doc));
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
		const query: Record<string, any> = { audioFiles: { $exists: true, $ne: null } };

		if (maxDuration !== undefined || minDuration !== undefined) {
			query.duration = {};
			if (maxDuration !== undefined) query.duration.$lte = maxDuration;
			if (minDuration !== undefined) query.duration.$gte = minDuration;
		}

		const data = await db
			.collection('videos')
			.find(query)
			.sort({ release_timestamp: -1 })
			.skip(skip)
			.limit(limit)
			.toArray();

		return data.map((doc) => serializeDocument(doc));
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
		const query: Record<string, any> = {};

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
		const sort: Record<string, any> = {};
		sort[property] = order === 'asc' ? 1 : -1;

		const skip = (pageNumber - 1) * limit;

		const data = await db
			.collection('videos')
			.find(query)
			.sort(sort)
			.skip(skip)
			.limit(limit)
			.toArray();

		return data.map((doc) => serializeDocument(doc));
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
		const query: Record<string, any> = {};

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
		const sort: Record<string, any> = {};
		sort[property] = order === 'asc' ? 1 : -1;

		const skip = (pageNumber - 1) * limit;

		const data = await db
			.collection('AUDIO_ASSETS')
			.find(query)
			.sort(sort)
			.skip(skip)
			.limit(limit)
			.toArray();

		return data.map((doc) => serializeDocument(doc));
	} catch (error) {
		console.error('[DB] Error in queryAudios:', error);
		throw error;
	}
}

/**
 * Recursively serializes a MongoDB document, converting all ObjectIds to strings
 * and ensuring the document is fully serializable for SvelteKit data loading.
 *
 * @param doc The document or value to serialize
 * @returns A serialized version of the document with all ObjectIds converted to strings
 */
function serializeDocument(doc: any): any {
	// Handle null/undefined
	if (doc == null) {
		return doc;
	}

	// Handle ObjectId (this is the key part that fixes the serialization issue)
	if (doc instanceof ObjectId) {
		return doc.toString();
	}

	// Handle Date objects
	if (doc instanceof Date) {
		return doc.toISOString();
	}

	// Handle arrays
	if (Array.isArray(doc)) {
		return doc.map((item) => serializeDocument(item));
	}

	// Handle objects (but not special types like Buffer)
	if (typeof doc === 'object' && doc.constructor === Object) {
		const result: Record<string, any> = {};
		for (const key in doc) {
			if (Object.hasOwn(doc, key)) {
				result[key] = serializeDocument(doc[key]);
			}
		}
		return result;
	}

	// Return primitives and other types as is
	return doc;
}
