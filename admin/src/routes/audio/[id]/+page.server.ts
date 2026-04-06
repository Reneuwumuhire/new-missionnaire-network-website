import { error } from '@sveltejs/kit';
import { getMusicAudioById, getMusicCategories, getMusicArtists } from '../../../db/collections';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const [audio, categories, artists] = await Promise.all([
		getMusicAudioById(params.id),
		getMusicCategories(),
		getMusicArtists()
	]);

	if (!audio) {
		throw error(404, 'Audio introuvable');
	}

	return { audio, categories, artists };
};
