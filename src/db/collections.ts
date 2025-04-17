import { getDb } from './mongo';
import { availableTypesTag } from '../utils/data';
import { ObjectId } from 'mongodb';
export async function getCollection(
	collection_name: string,
	skip: number,
	limit: number,
	filter?: string,
	search?: string
): Promise<any> {
	console.log('[DB] Starting query with params:', { collection_name, skip, limit, filter, search });

	try {
		const db = await getDb();
		const query: any = {};
		const conditions: any[] = [];

		// Add search condition if provided
		if (search && search.trim()) {
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
		return data.map(doc => serializeDocument(doc));
	} catch (error) {
		console.error('[DB] Error in getCollection:', error);
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
		return doc.map(item => serializeDocument(item));
	}

	// Handle objects (but not special types like Buffer)
	if (typeof doc === 'object' && doc.constructor === Object) {
		const result: Record<string, any> = {};
		for (const key in doc) {
			if (Object.prototype.hasOwnProperty.call(doc, key)) {
				result[key] = serializeDocument(doc[key]);
			}
		}
		return result;
	}

	// Return primitives and other types as is
	return doc;
}
