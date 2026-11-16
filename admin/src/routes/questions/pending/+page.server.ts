import { verifyAdminSession } from '$lib/server/admin-session';
import { error, fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	listAdminQuestions,
	permanentlyDeleteQuestion,
	updateQuestionModeration
} from '../../../db/questions';
import { canDeleteQuestions, canModerateQuestions } from '$lib/models/admin-user';
import { validateModerationReason } from '$lib/questions/validation';

export const load: PageServerLoad = async ({ cookies }) => {
	const adminUser = await verifyAdminSession(cookies);
	if (!canModerateQuestions(adminUser)) throw error(403, 'Accès refusé');
	// Streamed: the page renders its header + card skeletons immediately.
	const deferred = listAdminQuestions({ status: 'pending', page: 1, limit: 100 });
	deferred.catch(() => {});
	return {
		deferred,
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
