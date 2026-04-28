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

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!canViewQuestionsAdmin(locals.user)) throw error(403, 'Accès refusé');
	const status = url.searchParams.get('status') ?? 'all';
	const search = url.searchParams.get('search')?.trim() ?? '';
	const answered = url.searchParams.get('answered') ?? '';
	const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
	const result = await listAdminQuestions({ status, search, answered, page, limit: PAGE_SIZE });
	return {
		...result,
		status,
		search,
		answered,
		page,
		limit: PAGE_SIZE,
		canModerate: canModerateQuestions(locals.user),
		canDelete: canDeleteQuestions(locals.user),
		canDeletePermanently: locals.user.role === 'superadmin'
	};
};

export const actions: Actions = {
	moderate: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = formData.get('id')?.toString();
		const action = formData.get('actionName')?.toString();
		if (!id || !action) return fail(400, { error: 'Paramètres invalides' });
		const reason = validateModerationReason(formData.get('reason'));

		if (action === 'permanent_delete') {
			if (locals.user.role !== 'superadmin') throw error(403, 'Accès refusé');
			await permanentlyDeleteQuestion({ id, reason, moderator: locals.user });
			return { success: true };
		}

		if (action === 'soft_delete' && !canDeleteQuestions(locals.user)) {
			throw error(403, 'Accès refusé');
		}
		if (!canModerateQuestions(locals.user)) throw error(403, 'Accès refusé');

		await updateQuestionModeration({
			id,
			action,
			reason,
			moderator: locals.user
		});

		return { success: true };
	}
};
