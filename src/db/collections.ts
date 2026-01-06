import { getDb } from './mongo';
import { availableTypesTag } from '../utils/data';
import { ObjectId } from 'mongodb';
import type { YoutubeVideo } from '$lib/models/youtube';
import type { AudioAsset } from '$lib/models/media-assets';
import type { MusicAudio } from '$lib/models/music-audio';
import type { Sermon } from '$lib/models/sermon';
import type { Literature } from '$lib/models/literature';
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
		const query: Record<string, any> = {};
		const conditions: Record<string, any>[] = [];

		if (category && category !== 'All') {
			conditions.push({ category: category });
		}

		if (search && search.trim()) {
			conditions.push({
				$or: [
					{ title: { $regex: search, $options: 'i' } },
					{ book_full_name: { $regex: search, $options: 'i' } },
					{ artist: { $regex: search, $options: 'i' } }
				]
			});
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
		const total = await db.collection('music_audio').countDocuments(query);

		const [property, order] = orderBy.split(/[: ,]/);

		let data;
		if (property === 'random') {
			data = await db
				.collection('music_audio')
				.aggregate([{ $match: query }, { $sample: { size: limit } }])
				.toArray();
		} else {
			const sort: Record<string, any> = {};
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
			data: data.map((doc) => serializeDocument(doc)),
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

export async function getSongs(options: {
	limit?: number;
	skip?: number;
	search?: string;
}): Promise<YoutubeVideo[]> {
	const { limit = 20, skip = 0, search } = options;
	try {
		const db = await getDb();
		const query: Record<string, any> = {};

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

		return data.map((doc) => serializeDocument(doc));
	} catch (error) {
		console.error('[DB] Error in getSongs:', error);
		throw error;
	}
}

export async function getSongsCount(search?: string): Promise<number> {
	try {
		const db = await getDb();
		const query: Record<string, any> = {};

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
		const query: Record<string, any> = {};
		const conditions: Record<string, any>[] = [];

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
		const sort: Record<string, any> = {};
		sort[property] = order === 'asc' ? 1 : -1;

		const data = await db
			.collection('sermons')
			.find(query)
			.sort(sort)
			.skip(skip)
			.limit(limit)
			.toArray();

		return {
			data: data.map((doc) => serializeDocument(doc)),
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
		const query: Record<string, any> = {};
		const conditions: Record<string, any>[] = [];

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
		const sort: Record<string, any> = {};
		sort[property] = order === 'asc' ? 1 : -1;

		const data = await db
			.collection('literature')
			.find(query)
			.sort(sort)
			.skip(skip)
			.limit(limit)
			.toArray();

		return {
			data: data.map((doc) => serializeDocument(doc)),
			total
		};
	} catch (error) {
		console.error('[DB] Error in queryLiterature:', error);
		throw error;
	}
}
