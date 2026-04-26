import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createQuestionReply, getPublicQuestionDetail, reportQuestionContent } from '../../../db/questions';
import { ADMIN_SESSION_COOKIE, getQaUserFromToken } from '$lib/server/qa-auth';
import { validateReplyInput, validateReportInput } from '$lib/questions/validation';
import type { QuestionReportTargetType } from '$lib/models/questions';

export const load: PageServerLoad = async ({ params, cookies, url }) => {
	const detail = await getPublicQuestionDetail(params.slug);
	if (!detail) throw error(404, 'Question introuvable');

	const user = await getQaUserFromToken(cookies.get(ADMIN_SESSION_COOKIE));
	return {
		...detail,
		user,
		replyPosted: url.searchParams.get('reply') === 'posted',
		reportSent: url.searchParams.get('report') === 'sent'
	};
};

export const actions: Actions = {
	reply: async ({ request, params, cookies }) => {
		if (!params.slug) return fail(400, { replyError: 'Question invalide.' });
		const user = await getQaUserFromToken(cookies.get(ADMIN_SESSION_COOKIE));
		if (!user) return fail(401, { replyError: 'Connexion requise pour répondre.' });

		const detail = await getPublicQuestionDetail(params.slug, { incrementView: false });
		if (!detail) return fail(404, { replyError: 'Question introuvable.' });

		const formData = await request.formData();
		const parsed = validateReplyInput({ body: formData.get('body') });
		if (!parsed.ok || !parsed.value) {
			return fail(400, { replyError: parsed.error, replyBody: formData.get('body')?.toString() ?? '' });
		}

		const result = await createQuestionReply({
			questionId: detail.question._id,
			body: parsed.value.body,
			author: user
		});
		if (!result.ok) return fail(400, { replyError: result.error });

		throw redirect(303, `/questions/${params.slug}?reply=posted#discussion`);
	},

	report: async ({ request, params, cookies }) => {
		if (!params.slug) return fail(400, { reportError: 'Question invalide.' });
		const user = await getQaUserFromToken(cookies.get(ADMIN_SESSION_COOKIE));
		if (!user) return fail(401, { reportError: 'Connexion requise pour signaler un contenu.' });

		const detail = await getPublicQuestionDetail(params.slug, { incrementView: false });
		if (!detail) return fail(404, { reportError: 'Question introuvable.' });

		const formData = await request.formData();
		const targetType = formData.get('targetType')?.toString() as QuestionReportTargetType;
		const targetId = formData.get('targetId')?.toString() || detail.question._id;
		if (targetType !== 'question' && targetType !== 'reply') {
			return fail(400, { reportError: 'Cible de signalement invalide.' });
		}

		const parsed = validateReportInput({
			reason: formData.get('reason'),
			notes: formData.get('notes')
		});
		if (!parsed.ok || !parsed.value) return fail(400, { reportError: parsed.error });

		const result = await reportQuestionContent({
			targetType,
			targetId,
			questionId: detail.question._id,
			reason: parsed.value.reason,
			notes: parsed.value.notes,
			reporter: user
		});
		if (!result.ok) return fail(400, { reportError: result.error });

		throw redirect(303, `/questions/${params.slug}?report=sent`);
	}
};
