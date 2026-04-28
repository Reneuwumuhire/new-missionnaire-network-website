import { error, fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	listAdminQuestions,
	permanentlyDeleteQuestion,
	updateQuestionModeration
} from '../../../db/questions';
import { canDeleteQuestions, canModerateQuestions } from '$lib/models/admin-user';
import { validateModerationReason } from '$lib/questions/validation';

export const load: PageServerLoad = async ({ locals }) => {
	if (!canModerateQuestions(locals.user)) throw error(403, 'Accès refusé');
	const result = await listAdminQuestions({ status: 'pending', page: 1, limit: 100 });
	return {
		...result,
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
