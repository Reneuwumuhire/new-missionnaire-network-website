import { error, fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listOpenReports, resolveQuestionReport } from '../../../db/questions';
import { canModerateQuestions } from '$lib/models/admin-user';

const PAGE_SIZE = 30;

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!canModerateQuestions(locals.user)) throw error(403, 'Accès refusé');
	const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
	return {
		...(await listOpenReports({ page, limit: PAGE_SIZE })),
		page,
		limit: PAGE_SIZE
	};
};

export const actions: Actions = {
	resolve: async ({ request, locals }) => {
		if (!canModerateQuestions(locals.user)) throw error(403, 'Accès refusé');
		const formData = await request.formData();
		const reportId = formData.get('reportId')?.toString();
		const status = formData.get('status')?.toString();
		if (!reportId || (status !== 'reviewed' && status !== 'dismissed')) {
			return fail(400, { error: 'Paramètres invalides' });
		}
		await resolveQuestionReport({ reportId, status, moderator: locals.user });
		return { success: true };
	}
};
