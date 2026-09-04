import { dev } from '$app/environment';
import { fail, redirect } from '@sveltejs/kit';
import { completeLogin, SESSION_COOKIE } from '$lib/server/auth';
import { TWO_FACTOR_CHALLENGE_COOKIE, verifySecondFactor } from '$lib/server/two-factor-auth';
import {
	deleteLoginChallenge,
	findAdminByEmail,
	findLoginChallenge,
	logAudit,
	recordLoginChallengeFailure
} from '../../../db/collections';
import type { Actions, PageServerLoad } from './$types';

async function requireChallenge(token: string | undefined) {
	if (!token) throw redirect(303, '/login');
	const challenge = await findLoginChallenge(token);
	if (!challenge) throw redirect(303, '/login');
	return challenge;
}

export const load: PageServerLoad = async ({ cookies }) => {
	const challenge = await requireChallenge(cookies.get(TWO_FACTOR_CHALLENGE_COOKIE));
	return { email: challenge.user_id };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const token = cookies.get(TWO_FACTOR_CHALLENGE_COOKIE);
		const challenge = await requireChallenge(token);
		const code = (await request.formData()).get('code')?.toString().trim() ?? '';
		const user = await findAdminByEmail(challenge.user_id);

		if (!user || !user.is_active || !(await verifySecondFactor(user, code))) {
			const attempts = await recordLoginChallengeFailure(challenge.token);
			if (attempts >= 5) {
				await deleteLoginChallenge(challenge.token);
				cookies.delete(TWO_FACTOR_CHALLENGE_COOKIE, { path: '/login' });
				throw redirect(303, '/login?expired=1');
			}
			return fail(401, { error: 'Invalid authentication or recovery code' });
		}

		await deleteLoginChallenge(challenge.token);
		cookies.delete(TWO_FACTOR_CHALLENGE_COOKIE, { path: '/login' });
		const result = await completeLogin(user, challenge.ip_address, challenge.user_agent);
		cookies.set(SESSION_COOKIE, result.token, {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'lax',
			expires: result.expiresAt
		});
		await logAudit({
			user_id: user._id ?? user.email,
			user_email: user.email,
			action: 'login',
			target_collection: 'admin_users',
			target_id: user._id ?? null,
			changes: result.isNewDevice ? { security_event: { old: null, new: 'new_device' } } : null,
			ip_address: challenge.ip_address
		});
		throw redirect(303, challenge.next);
	}
};
