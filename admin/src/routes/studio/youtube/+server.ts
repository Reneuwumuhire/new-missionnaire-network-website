import { error, redirect } from '@sveltejs/kit';
import { getPermissions } from '$lib/models/admin-user';
import { beginYouTubeOAuth } from '$lib/server/youtube-oauth';
import { getDb } from '../../../db/mongo';

export async function GET({ url, locals }) {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Recording permission required');
	const code = url.searchParams.get('code') ?? '';
	if (!/^[0-9a-f-]{36}$/i.test(code)) throw error(400, 'Invalid Studio connection code');
	const authorization = await (await getDb()).collection('studio_authorizations').findOne({
		code,
		user_email: locals.user.email,
		expires_at: { $gt: new Date() }
	});
	if (!authorization) throw error(403, 'Approve this Studio session first');
	throw redirect(302, await beginYouTubeOAuth(locals.user.email, code));
}
