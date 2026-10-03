import { error, json } from '@sveltejs/kit';
import { getDb } from '../../../../../db/mongo';
import {
	normalizePublicationEngagement,
	type PublicationEngagementDocument,
	type PublicationReaction
} from '$lib/server/publicationEngagement';
import type { RequestHandler } from './$types';

const PUBLICATION_ID = /^(?:[a-f\d]{24}|WA\d{12})$/i;
const reactions = new Set<PublicationReaction>(['like', 'heart', 'laugh', 'wow', 'sad', 'pray']);

export const POST: RequestHandler = async ({ params, request }) => {
	if (!PUBLICATION_ID.test(params.id)) throw error(400, 'Publication invalide');

	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Requête invalide');
	}

	const db = await getDb();
	const collection = db.collection<PublicationEngagementDocument>('publication_engagement');
	let post;
	if (body.action === 'view' || body.action === 'share') {
		post = await collection.findOneAndUpdate(
			{ _id: params.id },
			{
				$inc: { [body.action === 'view' ? 'views' : 'shares']: 1 },
				$set: { updatedAt: new Date() }
			},
			{ upsert: true, returnDocument: 'after' }
		);
	} else if (body.action === 'reaction') {
		const next =
			typeof body.reaction === 'string' && reactions.has(body.reaction as PublicationReaction)
				? (body.reaction as PublicationReaction)
				: null;
		const previous =
			typeof body.previous === 'string' && reactions.has(body.previous as PublicationReaction)
				? (body.previous as PublicationReaction)
				: null;
		if ((!next && !previous) || next === previous) throw error(400, 'Réaction invalide');
		const changes: Record<string, unknown> = { updatedAt: '$$NOW' };
		if (previous) {
			const field = `reactions.${previous}`;
			changes[field] = { $max: [0, { $subtract: [{ $ifNull: [`$${field}`, 0] }, 1] }] };
		}
		if (next) {
			const field = `reactions.${next}`;
			changes[field] = { $add: [{ $ifNull: [`$${field}`, 0] }, 1] };
		}
		post = await collection.findOneAndUpdate(
			{ _id: params.id },
			[
				{
					$set: {
						views: { $ifNull: ['$views', 0] },
						shares: { $ifNull: ['$shares', 0] },
						reactions: {
							$ifNull: ['$reactions', { like: 0, heart: 0, laugh: 0, wow: 0, sad: 0, pray: 0 }]
						}
					}
				},
				{
					$set: changes
				}
			],
			{ upsert: true, returnDocument: 'after' }
		);
	} else {
		throw error(400, 'Action invalide');
	}

	return json(normalizePublicationEngagement(post), {
		headers: { 'cache-control': 'no-store' }
	});
};
