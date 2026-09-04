import { redirect } from '@sveltejs/kit';
import { getDashboardStats, getRecentAuditLogs } from '../db/collections';
import { canViewDashboard, getPermissions } from '$lib/models/admin-user';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const permissions = getPermissions(locals.user);
	if (!canViewDashboard(locals.user)) {
		if (permissions.can_view_questions) throw redirect(303, '/questions');
		if (permissions.can_review_lyrics) throw redirect(303, '/lyrics-review');
		throw redirect(303, '/settings');
	}

	// Streamed (not awaited): the page renders its header + skeleton instantly
	// and fills in stats/activity/banners when this resolves. See the page's
	// `{#await data.deferred}` block.
	const deferred = Promise.all([getDashboardStats(), getRecentAuditLogs(10)]).then(
		([stats, recentActivity]) => ({ stats, recentActivity })
	);
	// Rejections surface via the page's {:catch}; this avoids an unhandled
	// rejection if the client disconnects before consuming the stream.
	deferred.catch(() => {});

	return {
		deferred,
		canAddAudio: permissions.can_add,
		canManageAudio: permissions.can_add || permissions.can_edit || permissions.can_delete
	};
};
