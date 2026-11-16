import { error, type Cookies } from '@sveltejs/kit';
import { z } from 'zod';
import type { AdminUser } from '$lib/models/admin-user';
import { SESSION_COOKIE, validateSession } from './auth';

const sessionToken = z.uuid();
const requests = new WeakMap<Cookies, Promise<AdminUser | null>>();

export function getAdminSession(cookies: Cookies): Promise<AdminUser | null> {
	let session = requests.get(cookies);
	if (!session) {
		const token = sessionToken.safeParse(cookies.get(SESSION_COOKIE)).data;
		session = token ? validateSession(token) : Promise.resolve(null);
		requests.set(cookies, session);
	}
	return session;
}

export async function verifyAdminSession(
	cookies: Cookies,
	{ allowPasswordChangeRequired = false }: { allowPasswordChangeRequired?: boolean } = {}
): Promise<AdminUser> {
	const user = await getAdminSession(cookies);
	if (!user) error(401, 'Authentification requise');
	if (user.must_change_password && !allowPasswordChangeRequired) {
		error(403, 'Changement de mot de passe requis');
	}
	return user;
}
