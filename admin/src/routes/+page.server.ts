import { redirect } from '@sveltejs/kit';
import { getDashboardStats, getRecentAuditLogs, listScheduledLives } from '../db/collections';
import { canViewDashboard, getPermissions } from '$lib/models/admin-user';
import { listAdminQuestions } from '../db/questions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const permissions = getPermissions(locals.user);
	if (!canViewDashboard(locals.user)) {
		throw redirect(303, '/settings');
	}

	// Streamed (not awaited): the page renders its header + skeleton instantly
	// and fills in stats/activity/banners when this resolves. See the page's
	// `{#await data.deferred}` block.
	const canManageAudio = permissions.can_add || permissions.can_edit || permissions.can_delete;
	const deferred = Promise.all([
		canManageAudio ? getDashboardStats() : null,
		locals.user.role === 'superadmin' ? getRecentAuditLogs(5) : [],
		permissions.can_view_questions
			? listAdminQuestions({ limit: 1 }).then((result) => result.stats)
			: null,
		permissions.can_manage_recordings
			? listScheduledLives({ statuses: ['scheduled'], limit: 1 })
			: []
	]).then(([stats, recentActivity, questions, upcoming]) => ({
		stats,
		recentActivity,
		questions,
		upcoming
	}));
	// Rejections surface via the page's {:catch}; this avoids an unhandled
	// rejection if the client disconnects before consuming the stream.
	deferred.catch(() => {});

	return {
		deferred,
		canAddAudio: permissions.can_add,
		canManageAudio: permissions.can_add || permissions.can_edit || permissions.can_delete
	};
};
