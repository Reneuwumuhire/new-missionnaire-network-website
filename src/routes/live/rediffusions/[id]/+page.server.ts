import { error } from '@sveltejs/kit';
import { getPublishedById } from '$lib/server/recordings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const recording = await getPublishedById(params.id);
	if (!recording) throw error(404, 'Enregistrement introuvable');
	return { recording };
};
