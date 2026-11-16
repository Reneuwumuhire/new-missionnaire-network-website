import { verifyAdminSession } from '$lib/server/admin-session';
import { getPermissions } from '$lib/models/admin-user';
import { getBroadcastAdminState } from '../db/collections';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies, url }) => {
	if (url.pathname === '/login' || url.pathname.startsWith('/login/')) {
		return { user: null, broadcastIsLive: false };
	}

	const user = await verifyAdminSession(cookies, { allowPasswordChangeRequired: true });

	const permissions = getPermissions(user);
	const broadcast = !user.must_change_password && permissions.can_manage_recordings
		? await getBroadcastAdminState().catch(() => null)
		: null;

	return {
		user: {
			name: user.name,
			email: user.email,
			role: user.role,
			permissions
		},
		broadcastIsLive: Boolean(broadcast?.is_live)
	};
};
