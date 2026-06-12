import { dev } from '$app/environment';
import { fail, redirect } from '@sveltejs/kit';
import { login, SESSION_COOKIE } from '$lib/server/auth';
import {
	clearLoginFailures,
	countRecentLoginFailures,
	logAudit,
	LOGIN_ATTEMPT_MAX_FAILURES,
	recordLoginFailure
} from '../../db/collections';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE);
	if (token) {
		throw redirect(303, '/');
	}
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const formData = await request.formData();
		const email = formData.get('email')?.toString()?.trim();
		const password = formData.get('password')?.toString();

		if (!email || !password) {
			return fail(400, { error: 'Email et mot de passe requis', email: email ?? '' });
		}

		const ip = getClientAddress();
		const userAgent = request.headers.get('user-agent');

		// Brute-force throttle: 5 failures per (email + IP) in a 15 min rolling
		// window (enforced before bcrypt so locked-out requests stay cheap).
		// Documents expire via TTL index, so the lockout lifts on its own.
		const recentFailures = await countRecentLoginFailures(email, ip);
		if (recentFailures >= LOGIN_ATTEMPT_MAX_FAILURES) {
			console.warn(
				`[auth] Login throttled for ${email} from ${ip ?? 'unknown IP'} (${recentFailures} recent failures)`
			);
			return fail(429, { error: 'auth.tooManyAttempts', errorIsKey: true, email });
		}

		const result = await login(email, password, ip, userAgent);

		if (!result) {
			await recordLoginFailure(email, ip);
			return fail(401, { error: 'Email ou mot de passe incorrect', email });
		}

		await clearLoginFailures(email, ip);

		cookies.set(SESSION_COOKIE, result.token, {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'lax',
			expires: result.expiresAt
		});

		await logAudit({
			user_id: result.user._id ?? result.user.email,
			user_email: result.user.email,
			action: 'login',
			target_collection: 'admin_users',
			target_id: result.user._id ?? null,
			ip_address: ip
		});

		throw redirect(303, '/');
	}
};
