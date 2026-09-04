import { fail, redirect } from '@sveltejs/kit';
import {
	verifyPassword,
	hashPassword,
	invalidateSessionCache,
	revokeOtherSessions,
	SESSION_COOKIE
} from '$lib/server/auth';
import { twoFactorKey, verifySecondFactor } from '$lib/server/two-factor-auth';
import {
	buildOtpAuthUri,
	decryptTwoFactorSecret,
	encryptTwoFactorSecret,
	generateRecoveryCodes,
	generateTwoFactorSecret,
	hashRecoveryCode,
	verifyTotp
} from '$lib/two-factor';
import {
	beginTwoFactorSetup,
	countRecentLoginFailuresForEmail,
	deleteSessionForUser,
	findAdminByEmail,
	listSessionsForUser,
	setTwoFactorEnabled,
	updateAdminProfile,
	updateAdminPassword,
	logAudit
} from '../../db/collections';
import {
	deleteDisconnectedStudioAuthorizationById,
	listStudioAuthorizations,
	revokeStudioAuthorizationById,
	revokeStudioAuthorizationsForUser
} from '$lib/server/studio-ingest';
import type { Actions, PageServerLoad } from './$types';

function deviceName(userAgent: string | null): string {
	if (!userAgent) return 'Unknown device';
	const browser = userAgent.includes('Edg/')
		? 'Edge'
		: userAgent.includes('Firefox/')
			? 'Firefox'
			: userAgent.includes('Chrome/')
				? 'Chrome'
				: userAgent.includes('Safari/')
					? 'Safari'
					: 'Browser';
	const system = userAgent.includes('Windows')
		? 'Windows'
		: userAgent.includes('Android')
			? 'Android'
			: /iPhone|iPad/.test(userAgent)
				? 'iOS'
				: userAgent.includes('Mac OS')
					? 'macOS'
					: userAgent.includes('Linux')
						? 'Linux'
						: 'Unknown OS';
	return `${browser} on ${system}`;
}

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	const currentToken = cookies.get(SESSION_COOKIE) ?? '';
	const [studioAuthorizations, sessions, failedLoginAttempts] = await Promise.all([
		listStudioAuthorizations(locals.user.email),
		listSessionsForUser(locals.user.email),
		countRecentLoginFailuresForEmail(locals.user.email)
	]);
	return {
		user: {
			name: locals.user.name,
			email: locals.user.email,
			role: locals.user.role,
			created_at: locals.user.created_at,
			last_login: locals.user.last_login,
			must_change_password: locals.user.must_change_password,
			two_factor_enabled: locals.user.two_factor_enabled,
			recovery_codes_remaining: locals.user.recovery_code_hashes?.length ?? 0
		},
		passwordRequired:
			locals.user.must_change_password || url.searchParams.get('password') === 'required',
		twoFactorStatus: url.searchParams.get('twoFactor'),
		twoFactorConfigured: Boolean(twoFactorKey()),
		failedLoginAttempts,
		sessions: sessions.map((session) => ({
			id: session._id,
			device: deviceName(session.user_agent),
			ip_address: session.ip_address,
			created_at: session.created_at,
			expires_at: session.expires_at,
			is_current: session.token === currentToken,
			is_new_device:
				session.is_new_device &&
				new Date(session.created_at).getTime() > Date.now() - 24 * 60 * 60 * 1000
		})),
		studioAuthorizations
	};
};

export const actions: Actions = {
	profile: async ({ request, locals, getClientAddress }) => {
		const formData = await request.formData();
		const name = formData.get('name')?.toString()?.trim();

		if (!name || name.length < 2) {
			// Field-level error: the page translates the code and renders it
			// inline under the input (aria-invalid).
			return fail(400, {
				profileFieldError: { field: 'name', code: 'nameTooShort' } as const,
				profileSuccess: false
			});
		}

		try {
			await updateAdminProfile(locals.user.email, { name });

			await logAudit({
				user_id: locals.user.email,
				user_email: locals.user.email,
				action: 'update',
				target_collection: 'admin_users',
				target_id: locals.user._id ?? null,
				changes: { name: { old: locals.user.name, new: name } },
				ip_address: getClientAddress()
			});

			return { profileSuccess: true, profileError: null };
		} catch {
			return fail(500, { profileError: 'Erreur lors de la mise à jour', profileSuccess: false });
		}
	},

	password: async ({ request, locals, cookies, getClientAddress }) => {
		const formData = await request.formData();
		const currentPassword = formData.get('currentPassword')?.toString();
		const newPassword = formData.get('newPassword')?.toString();
		const confirmPassword = formData.get('confirmPassword')?.toString();

		if (!currentPassword || !newPassword || !confirmPassword) {
			return fail(400, { passwordError: 'Tous les champs sont requis', passwordSuccess: false });
		}

		if (newPassword.length < 8) {
			return fail(400, {
				passwordFieldError: { field: 'newPassword', code: 'passwordTooShort' } as const,
				passwordSuccess: false
			});
		}

		if (newPassword !== confirmPassword) {
			return fail(400, {
				passwordFieldError: { field: 'confirmPassword', code: 'passwordMismatch' } as const,
				passwordSuccess: false
			});
		}

		// Verify current password
		const user = await findAdminByEmail(locals.user.email);
		if (!user) {
			return fail(400, { passwordError: 'Utilisateur introuvable', passwordSuccess: false });
		}

		const valid = await verifyPassword(currentPassword, user.password_hash);
		if (!valid) {
			return fail(400, {
				passwordFieldError: { field: 'currentPassword', code: 'currentPasswordWrong' } as const,
				passwordSuccess: false
			});
		}

		try {
			const hash = await hashPassword(newPassword);
			await revokeStudioAuthorizationsForUser(locals.user.email);
			await updateAdminPassword(locals.user.email, hash);
			const currentToken = cookies.get(SESSION_COOKIE) ?? '';
			await revokeOtherSessions(locals.user.email, currentToken);
			invalidateSessionCache(currentToken);

			await logAudit({
				user_id: locals.user.email,
				user_email: locals.user.email,
				action: 'update',
				target_collection: 'admin_users',
				target_id: locals.user._id ?? null,
				changes: { password: { old: '***', new: '***' } },
				ip_address: getClientAddress()
			});

			return { passwordSuccess: true, passwordError: null };
		} catch {
			return fail(500, { passwordError: 'Erreur lors de la mise à jour', passwordSuccess: false });
		}
	},

	beginTwoFactor: async ({ request, locals, getClientAddress }) => {
		if (locals.user.role !== 'superadmin') return fail(403, { twoFactorError: 'Superadmins only' });
		const key = twoFactorKey();
		if (!key) return fail(503, { twoFactorError: 'Two-factor authentication is not configured' });
		const currentPassword = (await request.formData()).get('currentPassword')?.toString() ?? '';
		const user = await findAdminByEmail(locals.user.email);
		if (user?.two_factor_enabled) {
			return fail(409, { twoFactorError: 'Two-factor authentication is already enabled' });
		}
		if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
			return fail(400, { twoFactorError: 'Current password is incorrect' });
		}
		const secret = generateTwoFactorSecret();
		const recoveryCodes = generateRecoveryCodes();
		await beginTwoFactorSetup(
			user.email,
			encryptTwoFactorSecret(secret, key),
			recoveryCodes.map((code) => hashRecoveryCode(code, key))
		);
		await logAudit({
			user_id: user.email,
			user_email: user.email,
			action: 'update',
			target_collection: 'admin_users',
			target_id: user._id ?? null,
			changes: { two_factor_setup: { old: false, new: 'pending' } },
			ip_address: getClientAddress()
		});
		return {
			twoFactorSetup: {
				secret,
				recoveryCodes,
				otpAuthUri: buildOtpAuthUri(secret, user.email)
			}
		};
	},

	enableTwoFactor: async ({ request, locals, cookies, getClientAddress }) => {
		if (locals.user.role !== 'superadmin') return fail(403, { twoFactorError: 'Superadmins only' });
		const key = twoFactorKey();
		const code = (await request.formData()).get('code')?.toString() ?? '';
		const user = await findAdminByEmail(locals.user.email);
		if (!key || !user?.two_factor_secret) return fail(400, { twoFactorError: 'Start setup again' });
		try {
			if (!verifyTotp(decryptTwoFactorSecret(user.two_factor_secret, key), code)) {
				return fail(400, { twoFactorError: 'Invalid authentication code' });
			}
		} catch {
			return fail(400, { twoFactorError: 'Start setup again' });
		}
		await setTwoFactorEnabled(user.email, true);
		const currentToken = cookies.get(SESSION_COOKIE) ?? '';
		await revokeOtherSessions(user.email, currentToken);
		invalidateSessionCache(currentToken);
		await logAudit({
			user_id: user.email,
			user_email: user.email,
			action: 'update',
			target_collection: 'admin_users',
			target_id: user._id ?? null,
			changes: { two_factor_enabled: { old: false, new: true } },
			ip_address: getClientAddress()
		});
		throw redirect(303, '/settings?twoFactor=enabled');
	},

	disableTwoFactor: async ({ request, locals, cookies, getClientAddress }) => {
		if (locals.user.role !== 'superadmin') return fail(403, { twoFactorError: 'Superadmins only' });
		const formData = await request.formData();
		const password = formData.get('currentPassword')?.toString() ?? '';
		const code = formData.get('code')?.toString() ?? '';
		const user = await findAdminByEmail(locals.user.email);
		if (
			!user ||
			!(await verifyPassword(password, user.password_hash)) ||
			!(await verifySecondFactor(user, code))
		) {
			return fail(400, { twoFactorError: 'Password or authentication code is incorrect' });
		}
		await setTwoFactorEnabled(user.email, false);
		const currentToken = cookies.get(SESSION_COOKIE) ?? '';
		await revokeOtherSessions(user.email, currentToken);
		invalidateSessionCache(currentToken);
		await logAudit({
			user_id: user.email,
			user_email: user.email,
			action: 'update',
			target_collection: 'admin_users',
			target_id: user._id ?? null,
			changes: { two_factor_enabled: { old: true, new: false } },
			ip_address: getClientAddress()
		});
		throw redirect(303, '/settings?twoFactor=disabled');
	},

	revokeSession: async ({ request, locals, cookies, getClientAddress }) => {
		const id = (await request.formData()).get('id')?.toString() ?? '';
		const currentToken = cookies.get(SESSION_COOKIE) ?? '';
		const revokedToken = await deleteSessionForUser(id, locals.user.email, currentToken);
		if (!revokedToken) return fail(404, { sessionError: 'Session not found' });
		invalidateSessionCache(revokedToken);
		await logAudit({
			user_id: locals.user.email,
			user_email: locals.user.email,
			action: 'delete',
			target_collection: 'admin_sessions',
			target_id: id,
			ip_address: getClientAddress()
		});
		return { sessionRevoked: true };
	},

	revokeOtherSessions: async ({ locals, cookies, getClientAddress }) => {
		const count = await revokeOtherSessions(locals.user.email, cookies.get(SESSION_COOKIE) ?? '');
		await logAudit({
			user_id: locals.user.email,
			user_email: locals.user.email,
			action: 'delete',
			target_collection: 'admin_sessions',
			target_id: null,
			changes: { revoked_sessions: { old: count, new: 0 } },
			ip_address: getClientAddress()
		});
		return { otherSessionsRevoked: count };
	},

	revokeStudio: async ({ request, locals, getClientAddress }) => {
		const id = (await request.formData()).get('id')?.toString();
		if (!id) return fail(400, { studioError: 'Invalid Studio session' });
		if (!(await revokeStudioAuthorizationById(id, locals.user.email))) {
			return fail(404, { studioError: 'Studio session not found' });
		}
		await logAudit({
			user_id: locals.user.email,
			user_email: locals.user.email,
			action: 'update',
			target_collection: 'studio_authorizations',
			target_id: id,
			ip_address: getClientAddress()
		});
		return { studioRevoked: true };
	},

	deleteStudio: async ({ request, locals, getClientAddress }) => {
		const id = (await request.formData()).get('id')?.toString();
		if (!id) return fail(400, { studioDeleteError: true });
		if (!(await deleteDisconnectedStudioAuthorizationById(id, locals.user.email))) {
			return fail(409, { studioDeleteError: true });
		}
		await logAudit({
			user_id: locals.user.email,
			user_email: locals.user.email,
			action: 'delete',
			target_collection: 'studio_authorizations',
			target_id: id,
			ip_address: getClientAddress()
		});
		return { studioDeleted: true };
	}
};
