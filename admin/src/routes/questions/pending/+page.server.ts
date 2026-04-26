import { error, fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listAdminQuestions, updateQuestionModeration } from '../../../db/questions';
import { canModerateQuestions } from '$lib/models/admin-user';
import { validateModerationReason } from '$lib/questions/validation';

export const load: PageServerLoad = async ({ locals }) => {
	if (!canModerateQuestions(locals.user)) throw error(403, 'Accès refusé');
	const result = await listAdminQuestions({ status: 'pending', page: 1, limit: 100 });
	return result;
};

export const actions: Actions = {
	moderate: async ({ request, locals }) => {
		if (!canModerateQuestions(locals.user)) throw error(403, 'Accès refusé');
		const formData = await request.formData();
		const id = formData.get('id')?.toString();
		const action = formData.get('actionName')?.toString();
		if (!id || !action) return fail(400, { error: 'Paramètres invalides' });

		await updateQuestionModeration({
			id,
			action,
			reason: validateModerationReason(formData.get('reason')),
			moderator: locals.user
		});

		return { success: true };
	}
};
