import { error, redirect } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import { getDb } from '../../../db/mongo';
import { pageMeta, shareDescription } from '$lib/seo';
import { publicLiteratureFilter } from '$lib/server/literature';
import { objectIdString } from '$lib/server/mongo-input';
import type { Literature } from '$lib/models/literature';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const parsed = objectIdString.safeParse(params.id);
	if (!parsed.success) error(404, 'Document introuvable');
	const id = new ObjectId(parsed.data).toHexString();
	const path = `/literature/${id}`;
	if (params.id !== id) redirect(301, path);
	const db = await getDb();
	const item = await db.collection('literature').findOne<Omit<Literature, '_id'>>(
		{ ...publicLiteratureFilter, _id: new ObjectId(id) },
		{
			projection: {
				_id: 0,
				title: 1,
				author: 1,
				type: 1,
				language: 1,
				description: 1,
				pdf_url: 1,
				parts: 1
			}
		}
	);
	if (!item?.title) error(404, 'Document introuvable');
	const title = item.title.trim();
	return {
		title,
		author: item.author,
		language: item.language,
		description: item.description,
		pdfUrl: /^https?:\/\//i.test(item.pdf_url ?? '') ? item.pdf_url : null,
		parts: (item.parts ?? []).filter((part) => /^https?:\/\//i.test(part.url)),
		meta: pageMeta(path, {
			title: `${title} – ${item.author} | Missionnaire Network`,
			description: shareDescription(
				item.description?.trim() || `Lisez « ${title} » de ${item.author} sur Missionnaire Network.`
			)
		})
	};
};
