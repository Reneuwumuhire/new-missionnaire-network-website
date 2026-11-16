import type { Handle } from '@sveltejs/kit/hooks';
import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE } from '$lib/server/auth';
import { getAdminSession } from '$lib/server/admin-session';

const SESSION_EXEMPT_ROUTES = new Set([
	'/healthz',
	'/login',
	'/login/verify',
	'/login/passkey',
	'/api/studio/youtube',
	'/api/studio/update'
]);

export const handle: Handle = async ({ event, resolve }) => {
	event.setHeaders({
		'cache-control': 'private, no-store',
		'x-content-type-options': 'nosniff',
		'x-frame-options': 'DENY',
		'referrer-policy': 'strict-origin-when-cross-origin',
		'permissions-policy': 'camera=(), microphone=(), geolocation=()'
	});
	const { id } = event.route;
	if (id && SESSION_EXEMPT_ROUTES.has(id)) return resolve(event);

	const user = await getAdminSession(event.cookies);
	if (!user) {
		if (event.cookies.get(SESSION_COOKIE)) event.cookies.delete(SESSION_COOKIE, { path: '/' });
		const next = encodeURIComponent(event.url.pathname + event.url.search);
		redirect(303, `/login?next=${next}`);
	}

	if (user.must_change_password && id !== '/settings' && id !== '/logout') {
		redirect(303, '/settings?password=required');
	}
	return resolve(event);
};
