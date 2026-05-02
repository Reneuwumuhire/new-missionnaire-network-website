import { createHash } from 'crypto';
import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createQuestion, listQuestionsForAuthor } from '../../../db/questions';
import { ensurePublicQaUser, getCurrentQaUser, resolveQaDisplayName } from '$lib/server/qa-auth';
import { QUESTION_CATEGORIES, validateGuestName, validateQuestionInput } from '$lib/questions/validation';

function clientKey(ip: string, userAgent: string | null): string {
	return createHash('sha256').update(`${ip}:${userAgent ?? ''}`).digest('hex');
}

export const load: PageServerLoad = async ({ cookies, url }) => {
	const user = await getCurrentQaUser(cookies);
	return {
		user,
		myQuestions: user ? await listQuestionsForAuthor(user.email) : [],
		categories: QUESTION_CATEGORIES,
		submitted: url.searchParams.get('submitted') === '1'
	};
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const formData = await request.formData();
		const currentUser = await getCurrentQaUser(cookies);
		const parsed = validateQuestionInput({
			title: formData.get('title'),
			body: formData.get('body'),
			category: formData.get('category'),
			tags: formData.get('tags')
		});

		const values = {
			displayName: formData.get('displayName')?.toString() ?? '',
			title: formData.get('title')?.toString() ?? '',
			body: formData.get('body')?.toString() ?? '',
			category: formData.get('category')?.toString() ?? '',
			tags: formData.get('tags')?.toString() ?? ''
		};

		if (!parsed.ok || !parsed.value) {
			return fail(400, { error: parsed.error, values });
		}

		let author = currentUser;
		if (!author || author.isGuest) {
			const parsedName = validateGuestName(
				resolveQaDisplayName(formData.get('displayName'), currentUser?.name)
			);
			if (!parsedName.ok || !parsedName.value) {
				return fail(400, { error: parsedName.error, values });
			}
			author = await ensurePublicQaUser(cookies, parsedName.value);
		}

		const result = await createQuestion({
			...parsed.value,
			author,
			clientKey: clientKey(getClientAddress(), request.headers.get('user-agent'))
		});

		if (!result.ok) {
			return fail(429, { error: result.error, values });
		}

		throw redirect(303, '/questions/ask?submitted=1');
	}
};
