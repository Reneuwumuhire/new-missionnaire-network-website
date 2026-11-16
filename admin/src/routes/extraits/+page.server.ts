import { verifyAdminSession } from '$lib/server/admin-session';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, cookies }) => {
	await verifyAdminSession(cookies);
	redirect(308, `/publications${url.search}`);
};
