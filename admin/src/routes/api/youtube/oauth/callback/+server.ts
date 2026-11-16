import { verifyAdminSession } from '$lib/server/admin-session';
import { getPermissions } from '$lib/models/admin-user';
import { z } from 'zod';
import { error, redirect } from '@sveltejs/kit';
import { finishYouTubeOAuth } from '$lib/server/youtube-oauth';

export async function GET({ cookies, url }) {
	const user = await verifyAdminSession(cookies);
	if (!getPermissions(user).can_manage_recordings) error(403, 'Recording permission required');
	const denied = url.searchParams.get('error');
	if (denied) throw error(400, `YouTube authorization failed: ${denied}`);
	const code = z.string().min(1).max(2048).safeParse(url.searchParams.get('code')).data;
	const state = z.uuid().safeParse(url.searchParams.get('state')).data;
	if (!code || !state) throw error(400, 'Missing YouTube authorization response');
	let channelTitle: string;
	try {
		channelTitle = (await finishYouTubeOAuth(code, state, user.email)).channelTitle;
	} catch (cause) {
		throw error(400, cause instanceof Error ? cause.message : 'YouTube connection failed');
	}
	throw redirect(303, `/studio/youtube/connected?channel=${encodeURIComponent(channelTitle)}`);
}
