import { redirect, type Handle } from '@sveltejs/kit';
import { validateSession, SESSION_COOKIE } from '$lib/server/auth';

const PUBLIC_PATHS = ['/login'];

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
		return resolve(event);
	}

	const token = event.cookies.get(SESSION_COOKIE);
	if (!token) {
		throw redirect(303, '/login');
	}

	const user = await validateSession(token);
	if (!user) {
		event.cookies.delete(SESSION_COOKIE, { path: '/' });
		throw redirect(303, '/login');
	}

	event.locals.user = user;
	return resolve(event);
};
