import { getMusicCategories, getMusicArtists } from '../../../db/collections';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [categories, artists] = await Promise.all([getMusicCategories(), getMusicArtists()]);
	return { categories, artists };
};
