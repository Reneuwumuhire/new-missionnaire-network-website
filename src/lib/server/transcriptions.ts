import { z } from 'zod';
import { literalSearch, objectIdString, pageLimit, pageNumber } from '$lib/server/mongo-input';
import { ObjectId, type Db, type Filter } from 'mongodb';
import { getDb } from '../../db/mongo';
import { getReplayIdsForTranscripts } from './recordings';
import type { PDF } from '../../core/model/pdf';

export type SerializedTranscription = Omit<PDF, '_id' | 'videoId'> & {
	_id: string;
	videoId?: string;
	videoDisplayId?: string;
	replayId?: string;
};

const YEARS_TTL_MS = 5 * 60_000;
let yearsCache: { value: number[]; expires: number } | null = null;
let listIndexEnsured: Promise<string> | null = null;

// Prefer the transcript linked to a recording when several documents share a PDF.
const uniqueTranscripts = [
	{ $set: { hasRecording: { $ne: [{ $ifNull: ['$recordingId', null] }, null] } } },
	{ $sort: { hasRecording: -1, publishedOn: -1, _id: -1 } },
	{
		$group: {
			_id: {
				$cond: [
					{ $gt: [{ $strLenCP: { $ifNull: ['$s3Key', ''] } }, 0] },
					{ key: '$s3Key', exact: { $toHashedIndexKey: '$s3Key' } },
					'$_id'
				]
			},
			document: { $first: '$$ROOT' }
		}
	},
	{ $replaceWith: '$document' }
];

export async function getTranscriptionSitemapEntries(db: Db) {
	return db
		.collection('pdfs')
		.aggregate<{ _id: ObjectId; updatedAt?: Date; uploadDate?: Date }>(
			[
				{ $match: { _id: { $type: 'objectId' }, url: { $type: 'string', $ne: '' } } },
				...uniqueTranscripts,
				{ $project: { _id: 1, updatedAt: 1, uploadDate: 1 } }
			],
			{ collation: { locale: 'fr', numericOrdering: true } }
		)
		.toArray();
}

function ensureListIndex(db: Db) {
	listIndexEnsured ??= db
		.collection('pdfs')
		.createIndex(
			{ publishedOn: -1, filename: -1, _id: -1 },
			{
				name: 'transcriptions_list_desc',
				collation: { locale: 'fr', numericOrdering: true }
			}
		)
		.catch((error) => {
			listIndexEnsured = null;
			throw error;
		});
	return listIndexEnsured;
}

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
	const { page, limit, sort, year, search } = z
		.object({
			page: pageNumber.default(1),
			limit: pageLimit.default(12),
			sort: z.enum(['asc', 'desc']).default('desc'),
			year: z
				.string()
				.regex(/^\d{4}$/)
				.nullish(),
			search: literalSearch.nullish()
		})
		.parse(options);

	const db = await getDb();
	await ensureListIndex(db);
	const collection = db.collection<PDF>('pdfs');

	const query: Filter<PDF> = {};
	if (search) {
		query['filename'] = { $regex: search, $options: 'i' };
	}
	if (year) {
		const y = Number.parseInt(year);
		query['publishedOn'] = {
			$gte: new Date(y, 0, 1),
			$lt: new Date(y + 1, 0, 1)
		};
	}

	const skip = (page - 1) * limit;

	const direction = sort === 'desc' ? -1 : 1;
	const order = { publishedOn: direction, filename: direction, _id: direction };
	const [result] = await collection
		.aggregate<{
			documents: Array<PDF & { recordingId?: ObjectId | string }>;
			count: Array<{ total: number }>;
		}>(
			[
				{ $match: query },
				{
					$project: {
						filename: 1,
						url: 1,
						s3Key: 1,
						size: 1,
						publishedOn: 1,
						uploadDate: 1,
						videoId: 1,
						recordingId: 1
					}
				},
				...uniqueTranscripts,
				{
					$facet: {
						documents: [
							{ $sort: order },
							{ $skip: skip },
							{ $limit: limit },
							{ $unset: 'hasRecording' }
						],
						count: [{ $count: 'total' }]
					}
				}
			],
			{ collation: { locale: 'fr', numericOrdering: true } }
		)
		.toArray();
	const documents = result?.documents ?? [];
	const total = result?.count[0]?.total ?? 0;

	const videoIds = documents
		.map((d) => d.videoId)
		.filter((v): v is string => Boolean(v) && objectIdString.safeParse(String(v)).success)
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

	const replays = await getReplayIdsForTranscripts(
		documents.map((doc) => ({
			transcriptId: String(doc._id),
			recordingId: doc.recordingId,
			sourceVideoId: videoMap.get(String(doc.videoId))
		}))
	);

	const serialized: SerializedTranscription[] = documents.map((doc) => {
		const idStr = String(doc._id);
		const videoIdStr = doc.videoId ? String(doc.videoId) : undefined;
		return {
			...doc,
			_id: idStr,
			videoId: videoIdStr,
			videoDisplayId: videoIdStr ? videoMap.get(videoIdStr) : undefined,
			replayId: replays.get(idStr),
			publishedOn: doc.publishedOn instanceof Date ? doc.publishedOn : new Date(doc.publishedOn)
		} as SerializedTranscription;
	});

	return { documents: serialized, total };
}
