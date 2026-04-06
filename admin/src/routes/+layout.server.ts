import { getPermissions } from '$lib/models/admin-user';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (url.pathname.startsWith('/login')) {
		return { user: null };
	}
	return {
		user: locals.user
			? {
					name: locals.user.name,
					email: locals.user.email,
					role: locals.user.role,
					permissions: getPermissions(locals.user)
				}
			: null
	};
};
