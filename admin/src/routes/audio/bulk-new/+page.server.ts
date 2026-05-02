import { error } from '@sveltejs/kit';
import { getMusicCategories, getMusicArtists } from '../../../db/collections';
import { getPermissions } from '$lib/models/admin-user';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!getPermissions(locals.user).can_add) throw error(403, 'Accès refusé');

	const [categories, artists] = await Promise.all([getMusicCategories(), getMusicArtists()]);
	return { categories, artists };
};
