import { json, error } from '@sveltejs/kit';
import { createStudioTestLive, getStudioAuthorization, getBroadcastAdminState, getScheduledLiveById, listStudioScheduledLives, setBroadcastAdminState, setStudioScheduledLiveStatus, updateStudioLiveSubtitles } from '../../../../db/collections';

async function authorized(request: Request): Promise<{ email: string; name: string }> {
	const authorization = await getStudioAuthorization(request.headers.get('authorization')?.replace(/^Bearer\s+/, '') ?? '');
	if (!authorization) throw error(401, 'Authorize Studio in the admin app first');
	return authorization;
}

function defaultTitle(template: string | null): string { const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); const value = template?.trim() || '{date} Missionnaire Network Live audio'; return value.includes('{date}') ? value.replaceAll('{date}', date) : `${date} ${value}`; }

export async function POST({ request, url }) {
	const operator = await authorized(request);
	const body = (await request.json().catch(() => ({}))) as {
		action?: string; sessionId?: string;
		subtitleUrl?: string; subtitleKey?: string; subtitleFilename?: string;
		positionMs?: number; offsetMs?: number; atEpochMs?: number; paused?: boolean;
	};
	if (body.action === 'list') return json({ operator, sessions: await listStudioScheduledLives() });
	if (body.action === 'quick-test') {
		const current = await getBroadcastAdminState(); const token = crypto.randomUUID();
		const session = await createStudioTestLive({ title: defaultTitle(current.default_title), description: current.default_description, thumbnailUrl: current.default_thumbnail_url, thumbnailKey: current.default_thumbnail_s3_key, youtubeUrl: current.default_youtube_url, createdBy: operator.email, token });
		return json({ session, watchUrl: new URL(`/live/${session.slug}?test=${token}`, url.origin).toString() });
	}
	if (!body.sessionId) throw error(400, 'sessionId required');
	if (body.action === 'sync-subtitles') {
		const current = await getBroadcastAdminState();
		if (!current.is_live || current.scheduled_live_id !== body.sessionId) {
			throw error(409, 'This session is not live');
		}
		const positionMs = Number(body.positionMs);
		const offsetMs = Number(body.offsetMs ?? 0);
		if (!Number.isFinite(positionMs) || positionMs < 0 || positionMs > 24 * 60 * 60 * 1000) {
			throw error(400, 'Invalid subtitle position');
		}
		if (!Number.isFinite(offsetMs) || Math.abs(offsetMs) > 30 * 60 * 1000) {
			throw error(400, 'Invalid subtitle offset');
		}

		const attached = Boolean(body.subtitleKey || body.subtitleUrl);
		if (attached) {
			const expectedPath = `/${body.subtitleKey?.split('/').map(encodeURIComponent).join('/')}`;
			let uploadUrl: URL | null = null;
			try { uploadUrl = new URL(body.subtitleUrl ?? ''); } catch { /* rejected below */ }
			if (!body.subtitleKey?.startsWith('subtitles/') || uploadUrl?.protocol !== 'https:' || uploadUrl.pathname !== expectedPath) {
				throw error(400, 'Invalid subtitle upload');
			}
		} else if (!current.subtitle_srt_s3_key) {
			throw error(400, 'Attach an .srt file first');
		}

		const requestedAt = Number(body.atEpochMs ?? Date.now());
		const atEpochMs = Number.isFinite(requestedAt) && Math.abs(requestedAt - Date.now()) <= 60_000
			? requestedAt
			: Date.now();
		const anchorEpochMs = Math.round(atEpochMs - positionMs);
		const pausedPositionMs = body.paused === true
			? Math.max(0, Math.round(positionMs + offsetMs))
			: null;

		await updateStudioLiveSubtitles(body.sessionId, {
			...(attached ? {
				subtitle_srt_url: body.subtitleUrl!,
				subtitle_srt_s3_key: body.subtitleKey!,
				subtitle_filename: body.subtitleFilename?.slice(0, 255) || 'studio.srt'
			} : {}),
			subtitle_anchor_epoch_ms: anchorEpochMs,
			subtitle_offset_ms: Math.round(offsetMs)
		});
		// Make the proxy lookup valid before exposing the key to listeners.
		await setBroadcastAdminState({
			...(attached ? {
				subtitle_srt_url: body.subtitleUrl!,
				subtitle_srt_s3_key: body.subtitleKey!
			} : {}),
			subtitle_anchor_epoch_ms: anchorEpochMs,
			subtitle_offset_ms: Math.round(offsetMs),
			subtitle_paused_position_ms: pausedPositionMs
		});
		return json({ ok: true, anchorEpochMs, offsetMs, pausedPositionMs });
	}
	if (body.action === 'start') {
		const session = await getScheduledLiveById(body.sessionId);
		if (!session) throw error(404, 'Session not found');
		if (session.status !== 'scheduled') throw error(400, 'Session is no longer available');
		if ((await getBroadcastAdminState()).is_live) throw error(409, 'Another session is already live');
		const startedAt = new Date().toISOString();
		if (!(await setStudioScheduledLiveStatus(session._id, 'live', startedAt))) throw error(409, 'Session is no longer available');
		await setBroadcastAdminState({ is_live: true, started_at: startedAt, ended_at: null, started_by: operator.email, started_by_name: operator.name, icecast_offline_since: null, notification_pending: !session.is_test, is_test: session.is_test, title: session.title, description: session.description, thumbnail_url: session.thumbnail_url, thumbnail_s3_key: session.thumbnail_s3_key, scheduled_live_id: session._id, scheduled_live_slug: session.slug, subtitle_srt_url: session.subtitle_srt_url, subtitle_srt_s3_key: session.subtitle_srt_s3_key, subtitle_anchor_epoch_ms: null, subtitle_offset_ms: 0, subtitle_paused_position_ms: null });
		return json({ ok: true, startedAt, watchPath: `/live/${session.slug}` });
	}
	if (body.action === 'end') {
		const current = await getBroadcastAdminState();
		if (!current.is_live || current.scheduled_live_id !== body.sessionId) return json({ ok: true });
		const endedAt = new Date().toISOString();
		await setBroadcastAdminState({ is_live: false, ended_at: endedAt, notification_pending: false, is_test: false, subtitle_paused_position_ms: null });
		await setStudioScheduledLiveStatus(body.sessionId, 'ended', endedAt);
		return json({ ok: true, endedAt });
	}
	throw error(400, 'Unknown action');
}
