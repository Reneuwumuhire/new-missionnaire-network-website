import { error, redirect } from '@sveltejs/kit';
import { finishYouTubeOAuth } from '$lib/server/youtube-oauth';

export async function GET({ url }) {
	const denied = url.searchParams.get('error');
	if (denied) throw error(400, `YouTube authorization failed: ${denied}`);
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	if (!code || !state) throw error(400, 'Missing YouTube authorization response');
	let channelTitle: string;
	try {
		channelTitle = (await finishYouTubeOAuth(code, state)).channelTitle;
	} catch (cause) {
		throw error(400, cause instanceof Error ? cause.message : 'YouTube connection failed');
	}
	throw redirect(303, `/studio/youtube/connected?channel=${encodeURIComponent(channelTitle)}`);
}
