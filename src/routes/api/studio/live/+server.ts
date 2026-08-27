import { json, error } from '@sveltejs/kit';
import { checkLiveAudio } from '$lib/server/icecast';
import {
	getStudioAuthorization,
	revokeStudioAuthorization,
	createStudioScheduledLive,
	getBroadcastAdminState,
	getScheduledLiveById,
	listStudioScheduledLives,
	setBroadcastAdminState,
	setStudioScheduledLiveStatus,
	updateStudioLiveSubtitles
} from '../../../../db/collections';
import { presignUpload, s3Url } from '$lib/server/s3';

async function authorized(
	request: Request
): Promise<{ email: string; name: string; code: string }> {
	const code = request.headers.get('authorization')?.replace(/^Bearer\s+/, '') ?? '';
	const authorization = await getStudioAuthorization(code);
	if (!authorization) throw error(401, 'Authorize Studio in the admin app first');
	return { ...authorization, code };
}

function defaultTitle(template: string | null): string {
	const date = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Europe/Berlin',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date());
	const value = template?.trim() || '{date} Missionnaire Network Live audio';
	return value.includes('{date}') ? value.replaceAll('{date}', date) : `${date} ${value}`;
}

export async function POST({ request, url, fetch }) {
	const serverReceivedAtMs = Date.now();
	const operator = await authorized(request);
	const body = (await request.json().catch(() => ({}))) as {
		action?: string;
		sessionId?: string;
		title?: string;
		scheduledAt?: string;
		description?: string;
		youtubeUrl?: string;
		thumbnailUrl?: string;
		thumbnailKey?: string;
		subtitleUrl?: string;
		subtitleKey?: string;
		subtitleFilename?: string;
		announce?: boolean;
		reminderEnabled?: boolean;
		filename?: string;
		contentType?: string;
		size?: number;
		positionMs?: number;
		offsetMs?: number;
		atEpochMs?: number;
		paused?: boolean;
	};
	if (body.action === 'list') {
		return json({
			operator,
			sessions: await listStudioScheduledLives(),
			serverReceivedAtMs,
			serverSentAtMs: Date.now()
		});
	}
	if (body.action === 'logout') {
		await revokeStudioAuthorization(operator.code);
		return json({ ok: true });
	}
	if (body.action === 'presign-thumbnail') {
		const ext = (
			{
				'image/jpeg': 'jpg',
				'image/png': 'png',
				'image/webp': 'webp',
				'image/gif': 'gif'
			} as Record<string, string>
		)[body.contentType ?? ''];
		if (!ext || !body.size || body.size > 5 * 1024 * 1024)
			throw error(400, 'Thumbnail must be a JPEG, PNG, WebP or GIF under 5 MB');
		const key = `broadcast-thumbnails/${Date.now()}-${crypto.randomUUID()}.${ext}`;
		return json({
			uploadUrl: await presignUpload(key, body.contentType as string),
			key,
			publicUrl: s3Url(key)
		});
	}
	if (body.action === 'presign-subtitle') {
		if (!body.filename?.toLowerCase().endsWith('.srt') || !body.size || body.size > 2 * 1024 * 1024)
			throw error(400, 'Subtitle must be an .srt file under 2 MB');
		const key = `subtitles/${Date.now()}-${crypto.randomUUID()}.srt`;
		return json({
			uploadUrl: await presignUpload(key, 'text/plain; charset=utf-8'),
			key,
			publicUrl: s3Url(key),
			contentType: 'text/plain; charset=utf-8'
		});
	}
	if (body.action === 'create') {
		const title = body.title?.trim();
		if (!title || title.length > 160) throw error(400, 'A session title is required');
		const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : new Date();
		if (Number.isNaN(scheduledAt.getTime())) throw error(400, 'Invalid scheduled time');
		const session = await createStudioScheduledLive({
			title,
			scheduledAt,
			createdBy: operator.email,
			description: body.description?.trim() || null,
			youtubeUrl: body.youtubeUrl?.trim() || null,
			thumbnailUrl: body.thumbnailUrl ?? null,
			thumbnailKey: body.thumbnailKey ?? null,
			subtitleUrl: body.subtitleUrl ?? null,
			subtitleKey: body.subtitleKey ?? null,
			subtitleFilename: body.subtitleFilename ?? null,
			announce: body.announce === true,
			reminderEnabled: body.reminderEnabled === true
		});
		return json({ session });
	}
	if (body.action === 'quick-test') {
		const current = await getBroadcastAdminState();
		const accessToken = crypto.randomUUID();
		const session = await createStudioScheduledLive({
			title: defaultTitle(current.default_title),
			scheduledAt: new Date(),
			createdBy: operator.email,
			description: current.default_description,
			youtubeUrl: current.default_youtube_url,
			thumbnailUrl: current.default_thumbnail_url,
			thumbnailKey: current.default_thumbnail_s3_key,
			announce: false,
			reminderEnabled: false,
			testAccessToken: accessToken
		});
		return json({
			session,
			watchUrl: new URL(
				`/live/${session.slug}?test=${encodeURIComponent(accessToken)}`,
				url.origin
			).toString()
		});
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
			if (
				!body.subtitleKey?.startsWith('subtitles/') ||
				body.subtitleUrl !== s3Url(body.subtitleKey)
			) {
				throw error(400, 'Invalid subtitle upload');
			}
		} else if (!current.subtitle_srt_s3_key) {
			throw error(400, 'Attach an .srt file first');
		}
		const at = Number(body.atEpochMs ?? Date.now());
		const clickedAt = Number.isFinite(at) && Math.abs(at - Date.now()) <= 60_000 ? at : Date.now();
		const paused = body.paused === true;
		const anchorEpochMs = Math.round(clickedAt - positionMs);
		const pausedPositionMs = paused ? Math.max(0, Math.round(positionMs + offsetMs)) : null;
		await updateStudioLiveSubtitles(body.sessionId, {
			...(attached
				? {
						subtitle_srt_url: body.subtitleUrl!,
						subtitle_srt_s3_key: body.subtitleKey!,
						subtitle_filename: body.subtitleFilename?.slice(0, 255) || 'studio.srt'
					}
				: {}),
			subtitle_anchor_epoch_ms: anchorEpochMs,
			subtitle_offset_ms: Math.round(offsetMs)
		});
		// Make the proxy lookup valid before exposing the key to listeners.
		await setBroadcastAdminState({
			...(attached
				? {
						subtitle_srt_url: body.subtitleUrl!,
						subtitle_srt_s3_key: body.subtitleKey!
					}
				: {}),
			subtitle_anchor_epoch_ms: anchorEpochMs,
			subtitle_offset_ms: Math.round(offsetMs),
			subtitle_paused_position_ms: pausedPositionMs
		});
		return json({ ok: true, anchorEpochMs, offsetMs, pausedPositionMs });
	}
	if (body.action === 'start') {
		if (!(await checkLiveAudio(fetch)).isLive) {
			throw error(409, 'No live audio detected. Check the Missionnaire preview in admin first.');
		}
		const session = await getScheduledLiveById(body.sessionId);
		if (!session) throw error(404, 'Session not found');
		if (session.status !== 'scheduled') throw error(400, 'Session is no longer available');
		const current = await getBroadcastAdminState();
		if (current.is_live) throw error(409, 'Another session is already live');
		const startedAt = new Date().toISOString();
		if (!(await setStudioScheduledLiveStatus(session._id, 'live', startedAt))) {
			throw error(409, 'Session is no longer available');
		}
		// A transcript attached while scheduling should work without a second
		// admin-side edit. Opening the public gate is SRT 00:00 for that file;
		// Studio's live/media sync can replace this anchor immediately when the
		// operator has chosen a different cue or is following recorded media.
		const subtitleAnchorEpochMs = session.subtitle_srt_s3_key
			? new Date(startedAt).getTime()
			: null;
		if (subtitleAnchorEpochMs !== null) {
			await updateStudioLiveSubtitles(session._id, {
				subtitle_anchor_epoch_ms: subtitleAnchorEpochMs,
				subtitle_offset_ms: 0
			});
		}
		await setBroadcastAdminState({
			is_live: true,
			started_at: startedAt,
			ended_at: null,
			started_by: operator.email,
			started_by_name: operator.name,
			icecast_offline_since: null,
			is_test: Boolean(session.is_test),
			// Test links are deliberately unlisted and silent: no subscriber push
			// may be sent merely because an operator is checking the signal.
			notification_pending: !session.is_test,
			title: session.title,
			description: session.description,
			thumbnail_url: session.thumbnail_url,
			thumbnail_s3_key: session.thumbnail_s3_key,
			scheduled_live_id: session._id,
			scheduled_live_slug: session.slug,
			subtitle_srt_url: session.subtitle_srt_url,
			subtitle_srt_s3_key: session.subtitle_srt_s3_key,
			subtitle_anchor_epoch_ms: subtitleAnchorEpochMs,
			subtitle_offset_ms: 0,
			subtitle_paused_position_ms: null
		});
		return json({ ok: true, startedAt, watchPath: `/live/${session.slug}` });
	}

	if (body.action === 'end') {
		const current = await getBroadcastAdminState();
		if (!current.is_live || current.scheduled_live_id !== body.sessionId) return json({ ok: true });
		const endedAt = new Date().toISOString();
		await setBroadcastAdminState({
			is_live: false,
			ended_at: endedAt,
			notification_pending: false,
			is_test: false,
			subtitle_paused_position_ms: null
		});
		await setStudioScheduledLiveStatus(body.sessionId, 'ended', endedAt);
		return json({ ok: true, endedAt });
	}

	throw error(400, 'Unknown action');
}
