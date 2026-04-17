import { getPermissions } from '$lib/models/admin-user';
import { getBroadcastAdminState } from '../db/collections';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (url.pathname.startsWith('/login')) {
		return { user: null, broadcastIsLive: false };
	}

	if (!locals.user) {
		return { user: null, broadcastIsLive: false };
	}

	const permissions = getPermissions(locals.user);
	const broadcast = permissions.can_manage_recordings
		? await getBroadcastAdminState().catch(() => null)
		: null;

	return {
		user: {
			name: locals.user.name,
			email: locals.user.email,
			role: locals.user.role,
			permissions
		},
		broadcastIsLive: Boolean(broadcast?.is_live)
	};
};
