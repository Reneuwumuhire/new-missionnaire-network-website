import { error } from '@sveltejs/kit';
import { getPermissions } from '$lib/models/admin-user';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');
};
