import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { findSermonByIdentifier, normalizeSermon } from '$lib/server/sermonByIdentifier';
import { buildSermonSlug } from '../../../utils/sermonSlug';
import { getDb } from '../../../db/mongo';
import { ObjectId } from 'mongodb';
import { pageMeta } from '$lib/seo';

export const load: PageServerLoad = async ({ params }) => {
	const identifier = params.slug;
	const sermon = await findSermonByIdentifier(identifier);

	if (!sermon) {
		error(404, 'Prédication introuvable');
	}

	const canonicalSlug = buildSermonSlug(sermon);
	if (!canonicalSlug) {
		error(404, 'URL de prédication invalide');
	}

	if (identifier.toLowerCase() !== canonicalSlug.toLowerCase()) {
		redirect(301, `/predications/${canonicalSlug}`);
	}

	// Fetch related sermons (same author, excluding current)
	let relatedSermons: Record<string, unknown>[] = [];
	try {
		const db = await getDb();
		const sermons = db.collection('sermons');
		const related = await sermons
			.find({
				author: sermon.author,
				_id: { $ne: new ObjectId(sermon._id.toString()) }
			})
			.sort({ iso_date: -1 })
			.limit(6)
			.toArray();
		relatedSermons = related.map((doc) => ({
			...doc,
			_id: doc._id.toString(),
			slug: buildSermonSlug(doc as any) || doc._id.toString()
		}));
	} catch {
		// Non-critical, just return empty
	}

	const normalized = normalizeSermon(sermon);

	// Share preview (og:*/twitter:*) — rendered by the root layout as the
	// single canonical tag set, mirroring the page's JSON-LD values.
	const sermonTitle =
		(normalized as any).french_title || (normalized as any).english_title || 'Prédication';
	const sermonDate =
		(normalized as any).full_date_code || (normalized as any).date_code || (normalized as any).iso_date || '';
	const meta = pageMeta(`/predications/${canonicalSlug}`, {
		title: `${sermonTitle} | Prédications - Missionnaire Network`,
		description: `Écoutez la prédication "${sermonTitle}"${
			sermonDate ? ` (${sermonDate})` : ''
		} sur Missionnaire Network.`,
		type: 'article'
	});

	return {
		sermon: normalized,
		canonicalSlug,
		relatedSermons,
		meta
	};
};
