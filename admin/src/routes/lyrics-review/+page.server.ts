import { error } from '@sveltejs/kit';
import { canReviewLyrics } from '$lib/models/admin-user';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!canReviewLyrics(locals.user)) {
		throw error(403, 'Accès refusé');
	}
};
