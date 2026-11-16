import { verifyAdminSession } from '$lib/server/admin-session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, cookies }) => {
	await verifyAdminSession(cookies);
	return ({ channel: url.searchParams.get('channel') ?? 'YouTube' });
};
