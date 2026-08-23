import { json, error } from '@sveltejs/kit';
import {
	getStudioAuthorization,
	getBroadcastAdminState,
	getScheduledLiveById,
	listStudioScheduledLives,
	setBroadcastAdminState,
	setStudioScheduledLiveStatus
} from '../../../../db/collections';

async function authorized(request: Request): Promise<{ email: string; name: string }> {
	const code = request.headers.get('authorization')?.replace(/^Bearer\s+/, '') ?? '';
	const authorization = await getStudioAuthorization(code);
	if (!authorization) throw error(401, 'Authorize Studio in the admin app first');
	return authorization;
}

export async function POST({ request }) {
	const operator = await authorized(request);
	const body = (await request.json().catch(() => ({}))) as {
		action?: string;
		sessionId?: string;
	};

	if (body.action === 'list') return json({ operator, sessions: await listStudioScheduledLives() });
	if (!body.sessionId) throw error(400, 'sessionId required');
	if (body.action === 'start') {
		const session = await getScheduledLiveById(body.sessionId);
		if (!session) throw error(404, 'Session not found');
		if (session.status !== 'scheduled') throw error(400, 'Session is no longer available');
		const current = await getBroadcastAdminState();
		if (current.is_live) throw error(409, 'Another session is already live');
		const startedAt = new Date().toISOString();
		if (!(await setStudioScheduledLiveStatus(session._id, 'live', startedAt))) {
			throw error(409, 'Session is no longer available');
		}
		await setBroadcastAdminState({
			is_live: true,
			started_at: startedAt,
			ended_at: null,
			started_by: operator.email,
			started_by_name: operator.name,
			icecast_offline_since: null,
			notification_pending: true,
			title: session.title,
			description: session.description,
			thumbnail_url: session.thumbnail_url,
			thumbnail_s3_key: session.thumbnail_s3_key,
			scheduled_live_id: session._id,
			scheduled_live_slug: session.slug,
			subtitle_srt_url: session.subtitle_srt_url,
			subtitle_srt_s3_key: session.subtitle_srt_s3_key,
			subtitle_anchor_epoch_ms: null,
			subtitle_offset_ms: 0
		});
		return json({ ok: true, startedAt, watchPath: `/live/${session.slug}` });
	}

	if (body.action === 'end') {
		const current = await getBroadcastAdminState();
		if (!current.is_live || current.scheduled_live_id !== body.sessionId) return json({ ok: true });
		const endedAt = new Date().toISOString();
		await setBroadcastAdminState({ is_live: false, ended_at: endedAt, notification_pending: false });
		await setStudioScheduledLiveStatus(body.sessionId, 'ended', endedAt);
		return json({ ok: true, endedAt });
	}

	throw error(400, 'Unknown action');
}
