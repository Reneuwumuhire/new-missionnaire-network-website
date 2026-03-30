import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { findSermonByIdentifier, normalizeSermon } from '$lib/server/sermonByIdentifier';
import { buildSermonSlug } from '../../../utils/sermonSlug';

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

	return {
		sermon: normalizeSermon(sermon),
		canonicalSlug
	};
};
