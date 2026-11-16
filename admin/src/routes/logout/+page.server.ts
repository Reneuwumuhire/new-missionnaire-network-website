import { verifyAdminSession } from '$lib/server/admin-session';
import { redirect } from '@sveltejs/kit';
import { logout, SESSION_COOKIE } from '$lib/server/auth';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ cookies }) => {
		await verifyAdminSession(cookies, { allowPasswordChangeRequired: true });
		const token = cookies.get(SESSION_COOKIE);
		if (token) {
			await logout(token);
			cookies.delete(SESSION_COOKIE, { path: '/' });
		}
		throw redirect(303, '/login');
	}
};
