import { verifyAdminSession } from '$lib/server/admin-session';
import { error } from '@sveltejs/kit';
import { getPermissions } from '$lib/models/admin-user';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const adminUser = await verifyAdminSession(cookies);
	if (!getPermissions(adminUser).can_manage_recordings) throw error(403, 'Accès refusé');
};
