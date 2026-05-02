import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createQuestionReply, getPublicQuestionDetail } from '../../../db/questions';
import { ensurePublicQaUser, getCurrentQaUser, resolveQaDisplayName } from '$lib/server/qa-auth';
import { validateGuestName, validateReplyInput } from '$lib/questions/validation';

export const load: PageServerLoad = async ({ params, cookies, url }) => {
	const detail = await getPublicQuestionDetail(params.slug);
	if (!detail) throw error(404, 'Question introuvable');

	const user = await getCurrentQaUser(cookies);
	return {
		...detail,
		user,
		replyPosted: url.searchParams.get('reply') === 'posted'
	};
};

export const actions: Actions = {
	reply: async ({ request, params, cookies }) => {
		if (!params.slug) return fail(400, { replyError: 'Question invalide.' });
		const currentUser = await getCurrentQaUser(cookies);

		const detail = await getPublicQuestionDetail(params.slug, { incrementView: false });
		if (!detail) return fail(404, { replyError: 'Question introuvable.' });

		const formData = await request.formData();
		const replyDisplayName = formData.get('displayName')?.toString() ?? '';
		const parsed = validateReplyInput({ body: formData.get('body') });
		if (!parsed.ok || !parsed.value) {
			return fail(400, {
				replyError: parsed.error,
				replyBody: formData.get('body')?.toString() ?? '',
				replyDisplayName
			});
		}

		let author = currentUser;
		if (!author || author.isGuest) {
			const parsedName = validateGuestName(
				resolveQaDisplayName(replyDisplayName, currentUser?.name)
			);
			if (!parsedName.ok || !parsedName.value) {
				return fail(400, {
					replyError: parsedName.error,
					replyBody: formData.get('body')?.toString() ?? '',
					replyDisplayName
				});
			}
			author = await ensurePublicQaUser(cookies, parsedName.value);
		}

		const result = await createQuestionReply({
			questionId: detail.question._id,
			body: parsed.value.body,
			author
		});
		if (!result.ok) return fail(400, { replyError: result.error });

		throw redirect(303, `/questions/${params.slug}?reply=posted#discussion`);
	}
};
