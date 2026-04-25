import { ObjectId, type Filter } from 'mongodb';
import { getDb } from '../../db/mongo';
import type { PDF } from '../../core/model/pdf';

export type SerializedTranscription = Omit<PDF, '_id' | 'videoId'> & {
	_id: string;
	videoId?: string;
	videoDisplayId?: string;
};

const YEARS_TTL_MS = 5 * 60_000;
let yearsCache: { value: number[]; expires: number } | null = null;

export async function getTranscriptionYears(): Promise<number[]> {
	if (yearsCache && yearsCache.expires > Date.now()) return yearsCache.value;
	const db = await getDb();
	const collection = db.collection<PDF>('pdfs');
	const dates = await collection.distinct('publishedOn');
	const years = [
		...new Set(
			(dates as Array<Date | string>)
				.map((d) => {
					const date = d instanceof Date ? d : new Date(d);
					return Number.isNaN(date.getTime()) ? null : date.getFullYear();
				})
				.filter((y): y is number => y !== null)
		)
	].sort((a, b) => b - a);
	yearsCache = { value: years, expires: Date.now() + YEARS_TTL_MS };
	return years;
}

export async function queryTranscriptions(options: {
	page?: number;
	limit?: number;
	sort?: 'asc' | 'desc';
	year?: string | null;
	search?: string | null;
}): Promise<{ documents: SerializedTranscription[]; total: number }> {
	const { page = 1, limit = 12, sort = 'desc', year = null, search = null } = options;

	const db = await getDb();
	const collection = db.collection<PDF>('pdfs');

	const query: Filter<PDF> = {};
	if (search?.trim()) {
		query['filename'] = { $regex: search.trim(), $options: 'i' };
	}
	if (year) {
		const y = Number.parseInt(year);
		query['publishedOn'] = {
			$gte: new Date(y, 0, 1),
			$lt: new Date(y + 1, 0, 1)
		};
	}

	const total = await collection.countDocuments(query);
	const skip = (page - 1) * limit;

	const documents = await collection
		.find(query)
		.sort({
			publishedOn: sort === 'desc' ? -1 : 1,
			filename: sort === 'desc' ? -1 : 1,
			_id: sort === 'desc' ? -1 : 1
		})
		.collation({ locale: 'fr', numericOrdering: true })
		.skip(skip)
		.limit(limit)
		.toArray();

	const videoIds = documents
		.map((d) => d.videoId)
		.filter((v): v is string => Boolean(v) && ObjectId.isValid(String(v)))
		.map((v) => new ObjectId(String(v)));

	const videoMap = new Map<string, string>();
	if (videoIds.length > 0) {
		const videos = await db
			.collection('videos')
			.find({ _id: { $in: videoIds } }, { projection: { _id: 1, id: 1 } })
			.toArray();
		for (const v of videos) {
			if (v.id) videoMap.set(String(v._id), v.id);
		}
	}

	const serialized: SerializedTranscription[] = documents.map((doc) => {
		const idStr = String(doc._id);
		const videoIdStr = doc.videoId ? String(doc.videoId) : undefined;
		return {
			...doc,
			_id: idStr,
			videoId: videoIdStr,
			videoDisplayId: videoIdStr ? videoMap.get(videoIdStr) : undefined,
			publishedOn: doc.publishedOn instanceof Date ? doc.publishedOn : new Date(doc.publishedOn)
		} as SerializedTranscription;
	});

	return { documents: serialized, total };
}
