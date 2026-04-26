import { createHash } from 'crypto';
import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createQuestion } from '../../../db/questions';
import { ADMIN_SESSION_COOKIE, getQaUserFromToken } from '$lib/server/qa-auth';
import { QUESTION_CATEGORIES, validateQuestionInput } from '$lib/questions/validation';

function clientKey(ip: string, userAgent: string | null): string {
	return createHash('sha256').update(`${ip}:${userAgent ?? ''}`).digest('hex');
}

export const load: PageServerLoad = async ({ cookies, url }) => {
	const user = await getQaUserFromToken(cookies.get(ADMIN_SESSION_COOKIE));
	return {
		user,
		categories: QUESTION_CATEGORIES,
		submitted: url.searchParams.get('submitted') === '1'
	};
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const user = await getQaUserFromToken(cookies.get(ADMIN_SESSION_COOKIE));
		if (!user) {
			return fail(401, {
				error: 'Vous devez être connecté pour poser une question.',
				values: { title: '', body: '', category: '', tags: '' }
			});
		}

		const formData = await request.formData();
		const parsed = validateQuestionInput({
			title: formData.get('title'),
			body: formData.get('body'),
			category: formData.get('category'),
			tags: formData.get('tags')
		});

		const values = {
			title: formData.get('title')?.toString() ?? '',
			body: formData.get('body')?.toString() ?? '',
			category: formData.get('category')?.toString() ?? '',
			tags: formData.get('tags')?.toString() ?? ''
		};

		if (!parsed.ok || !parsed.value) {
			return fail(400, { error: parsed.error, values });
		}

		const result = await createQuestion({
			...parsed.value,
			author: user,
			clientKey: clientKey(getClientAddress(), request.headers.get('user-agent'))
		});

		if (!result.ok) {
			return fail(429, { error: result.error, values });
		}

		throw redirect(303, '/questions/ask?submitted=1');
	}
};
