import { getDb } from '../../db/mongo';

export type PublicationReaction = 'like' | 'heart' | 'laugh' | 'wow' | 'sad' | 'pray';
export type PublicationEngagement = {
	views: number;
	shares: number;
	reactions: Record<PublicationReaction, number>;
};
export type PublicationEngagementDocument = {
	_id: string;
	views?: number;
	shares?: number;
	reactions?: Partial<Record<PublicationReaction, number>>;
	updatedAt?: Date;
};

const count = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

export function normalizePublicationEngagement(
	value?: Partial<PublicationEngagementDocument> | null
): PublicationEngagement {
	return {
		views: count(value?.views),
		shares: count(value?.shares),
		reactions: {
			like: count(value?.reactions?.like),
			heart: count(value?.reactions?.heart),
			laugh: count(value?.reactions?.laugh),
			wow: count(value?.reactions?.wow),
			sad: count(value?.reactions?.sad),
			pray: count(value?.reactions?.pray)
		}
	};
}

export async function getPublicationEngagement(ids: string[]) {
	if (!ids.length) return new Map<string, PublicationEngagement>();
	const db = await getDb();
	const rows = await db
		.collection<PublicationEngagementDocument>('publication_engagement')
		.find({ _id: { $in: ids } }, { projection: { views: 1, shares: 1, reactions: 1 } })
		.toArray();
	return new Map(
		rows.map((row) => [String(row._id), normalizePublicationEngagement(row)] as const)
	);
}
