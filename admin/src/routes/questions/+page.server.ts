import { verifyAdminSession } from '$lib/server/admin-session';
import { error, fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	listAdminQuestions,
	permanentlyDeleteQuestion,
	updateQuestionModeration
} from '../../db/questions';
import {
	canDeleteQuestions,
	canModerateQuestions,
	canViewQuestionsAdmin
} from '$lib/models/admin-user';
import { validateModerationReason } from '$lib/questions/validation';

const PAGE_SIZE = 20;

export const load: PageServerLoad = async ({ url, cookies }) => {
	const adminUser = await verifyAdminSession(cookies);
	if (!canViewQuestionsAdmin(adminUser)) throw error(403, 'Accès refusé');
	const status = url.searchParams.get('status') ?? 'all';
	const search = url.searchParams.get('search')?.trim() ?? '';
	const answered = url.searchParams.get('answered') ?? '';
	const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
	// Streamed: the page shows skeletons (stat cards + table rows) while the
	// aggregate query runs. See `{#await data.deferred}` in +page.svelte.
	const deferred = listAdminQuestions({ status, search, answered, page, limit: PAGE_SIZE });
	deferred.catch(() => {});
	return {
		deferred,
		status,
		search,
		answered,
		page,
		limit: PAGE_SIZE,
		canModerate: canModerateQuestions(adminUser),
		canDelete: canDeleteQuestions(adminUser),
		canDeletePermanently: adminUser.role === 'superadmin'
	};
};

export const actions: Actions = {
	moderate: async ({ request, cookies }) => {
		const adminUser = await verifyAdminSession(cookies);
		const formData = await request.formData();
		const id = formData.get('id')?.toString();
		const action = formData.get('actionName')?.toString();
		if (!id || !action) return fail(400, { error: 'Paramètres invalides' });
		const reason = validateModerationReason(formData.get('reason'));

		if (action === 'permanent_delete') {
			if (adminUser.role !== 'superadmin') throw error(403, 'Accès refusé');
			await permanentlyDeleteQuestion({ id, reason, moderator: adminUser });
			return { success: true };
		}

		if (action === 'soft_delete' && !canDeleteQuestions(adminUser)) {
			throw error(403, 'Accès refusé');
		}
		if (!canModerateQuestions(adminUser)) throw error(403, 'Accès refusé');

		await updateQuestionModeration({
			id,
			action,
			reason,
			moderator: adminUser
		});

		return { success: true };
	}
};
