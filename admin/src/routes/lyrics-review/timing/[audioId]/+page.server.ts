import { verifyAdminSession } from '$lib/server/admin-session';
import { error } from '@sveltejs/kit';
import { canReviewLyrics } from '$lib/models/admin-user';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies }) => {
	const adminUser = await verifyAdminSession(cookies);
	if (!canReviewLyrics(adminUser)) {
		throw error(403, 'Accès refusé');
	}

	return {
		audioId: params.audioId
	};
};
