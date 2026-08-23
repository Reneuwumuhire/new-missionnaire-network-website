import { json, error } from '@sveltejs/kit';
import { createStudioTestLive, getStudioAuthorization, getBroadcastAdminState, getScheduledLiveById, listStudioScheduledLives, setBroadcastAdminState, setStudioScheduledLiveStatus } from '../../../../db/collections';

async function authorized(request: Request): Promise<{ email: string; name: string }> {
	const authorization = await getStudioAuthorization(request.headers.get('authorization')?.replace(/^Bearer\s+/, '') ?? '');
	if (!authorization) throw error(401, 'Authorize Studio in the admin app first');
	return authorization;
}

function defaultTitle(template: string | null): string { const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); const value = template?.trim() || '{date} Missionnaire Network Live audio'; return value.includes('{date}') ? value.replaceAll('{date}', date) : `${date} ${value}`; }

export async function POST({ request, url }) {
	const operator = await authorized(request);
	const body = (await request.json().catch(() => ({}))) as { action?: string; sessionId?: string };
	if (body.action === 'list') return json({ operator, sessions: await listStudioScheduledLives() });
	if (body.action === 'quick-test') {
		const current = await getBroadcastAdminState(); const token = crypto.randomUUID();
		const session = await createStudioTestLive({ title: defaultTitle(current.default_title), description: current.default_description, thumbnailUrl: current.default_thumbnail_url, thumbnailKey: current.default_thumbnail_s3_key, youtubeUrl: current.default_youtube_url, createdBy: operator.email, token });
		return json({ session, watchUrl: new URL(`/live/${session.slug}?test=${token}`, url.origin).toString() });
	}
	if (!body.sessionId) throw error(400, 'sessionId required');
	if (body.action === 'start') {
		const session = await getScheduledLiveById(body.sessionId);
		if (!session) throw error(404, 'Session not found');
		if (session.status !== 'scheduled') throw error(400, 'Session is no longer available');
		if ((await getBroadcastAdminState()).is_live) throw error(409, 'Another session is already live');
		const startedAt = new Date().toISOString();
		if (!(await setStudioScheduledLiveStatus(session._id, 'live', startedAt))) throw error(409, 'Session is no longer available');
		await setBroadcastAdminState({ is_live: true, started_at: startedAt, ended_at: null, started_by: operator.email, started_by_name: operator.name, icecast_offline_since: null, notification_pending: !session.is_test, is_test: session.is_test, title: session.title, description: session.description, thumbnail_url: session.thumbnail_url, thumbnail_s3_key: session.thumbnail_s3_key, scheduled_live_id: session._id, scheduled_live_slug: session.slug, subtitle_srt_url: session.subtitle_srt_url, subtitle_srt_s3_key: session.subtitle_srt_s3_key, subtitle_anchor_epoch_ms: null, subtitle_offset_ms: 0 });
		return json({ ok: true, startedAt, watchPath: `/live/${session.slug}` });
	}
	if (body.action === 'end') {
		const current = await getBroadcastAdminState();
		if (!current.is_live || current.scheduled_live_id !== body.sessionId) return json({ ok: true });
		const endedAt = new Date().toISOString();
		await setBroadcastAdminState({ is_live: false, ended_at: endedAt, notification_pending: false, is_test: false });
		await setStudioScheduledLiveStatus(body.sessionId, 'ended', endedAt);
		return json({ ok: true, endedAt });
	}
	throw error(400, 'Unknown action');
}
