import { error, json } from '@sveltejs/kit';
import { getDb } from '../../../../db/mongo';
import { getScheduledLiveById } from '../../../../db/collections';
import { transitionYouTubeLive, youtubeConnection } from '$lib/server/youtube-oauth';

async function operator(request: Request): Promise<{ email: string; name: string }> {
	const code = request.headers.get('authorization')?.replace(/^Bearer\s+/, '') ?? '';
	const doc = await (await getDb()).collection('studio_authorizations').findOne({
		code,
		expires_at: { $gt: new Date() }
	});
	if (!doc || typeof doc.user_email !== 'string') throw error(401, 'Authorize Studio in the admin app first');
	return {
		email: doc.user_email,
		name: typeof doc.user_name === 'string' ? doc.user_name : doc.user_email
	};
}

export async function POST({ request }) {
	const user = await operator(request);
	const body = (await request.json().catch(() => ({}))) as { action?: string; sessionId?: string };
	if (body.action === 'status') return json({ operator: user, ...(await youtubeConnection(user.email)) });
	if (body.action === 'go-live') {
		if (typeof body.sessionId !== 'string') throw error(400, 'A scheduled session is required');
		const session = await getScheduledLiveById(body.sessionId);
		if (!session || session.is_test || !['scheduled', 'live'].includes(session.status)) {
			throw error(404, 'Scheduled session not found');
		}
		if (!session.youtube_url) throw error(400, 'Add the scheduled YouTube link to this session first');
		try {
			return json({ ok: true, ...(await transitionYouTubeLive(user.email, session.youtube_url)) });
		} catch (cause) {
			throw error(409, cause instanceof Error ? cause.message : 'YouTube could not go live');
		}
	}
	throw error(400, 'Unknown action');
}
