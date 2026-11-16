import { objectIdString } from '$lib/server/mongo-input';
import { verifyAdminSession } from '$lib/server/admin-session';
import { error, fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listOpenReports, resolveQuestionReport } from '../../../db/questions';
import { canModerateQuestions } from '$lib/models/admin-user';

const PAGE_SIZE = 30;

export const load: PageServerLoad = async ({ url, cookies }) => {
	const adminUser = await verifyAdminSession(cookies);
	if (!canModerateQuestions(adminUser)) throw error(403, 'Accès refusé');
	const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
	// Streamed: the page renders its header + card skeletons immediately.
	const deferred = listOpenReports({ page, limit: PAGE_SIZE });
	deferred.catch(() => {});
	return {
		deferred,
		page,
		limit: PAGE_SIZE
	};
};

export const actions: Actions = {
	resolve: async ({ request, cookies }) => {
		const adminUser = await verifyAdminSession(cookies);
		if (!canModerateQuestions(adminUser)) throw error(403, 'Accès refusé');
		const formData = await request.formData();
		const reportId = objectIdString.safeParse(formData.get('reportId')).data;
		const status = formData.get('status')?.toString();
		if (!reportId || (status !== 'reviewed' && status !== 'dismissed')) {
			return fail(400, { error: 'Paramètres invalides' });
		}
		if (!(await resolveQuestionReport({ reportId, status, moderator: adminUser }))) {
			return fail(404, { error: 'Signalement introuvable' });
		}
		return { success: true };
	}
};
