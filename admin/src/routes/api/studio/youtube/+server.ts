import { error, json } from '@sveltejs/kit';
import { getDb } from '../../../../db/mongo';
import {
	createScheduledLive,
	getBroadcastAdminState,
	getScheduledLiveById,
	logAudit
} from '../../../../db/collections';
import {
	deleteYouTubeLive,
	scheduleYouTubeLive,
	transitionYouTubeLive,
	youtubeConnection,
	youtubeIngest
} from '$lib/server/youtube-oauth';
import {
	parseDescription,
	parseScheduledAt,
	parseSubtitleTriple,
	parseThumbnailPair,
	parseTitle
} from '$lib/server/scheduled-live-validation';
import { buildWatchUrl, pingBroadcastEvent } from '$lib/server/main-site';

async function operator(request: Request): Promise<{ email: string; name: string }> {
	const code = request.headers.get('authorization')?.replace(/^Bearer\s+/, '') ?? '';
	const doc = await (await getDb()).collection('studio_authorizations').findOne({
		code,
		expires_at: { $gt: new Date() }
	});
	if (!doc || typeof doc.user_email !== 'string')
		throw error(401, 'Authorize Studio in the admin app first');
	return {
		email: doc.user_email,
		name: typeof doc.user_name === 'string' ? doc.user_name : doc.user_email
	};
}

export async function POST({ request, getClientAddress }) {
	const user = await operator(request);
	const body = (await request.json().catch(() => ({}))) as {
		action?: string;
		sessionId?: string;
		title?: unknown;
		description?: unknown;
		scheduledAt?: unknown;
		privacyStatus?: unknown;
		thumbnailUrl?: unknown;
		thumbnailKey?: unknown;
		subtitleUrl?: unknown;
		subtitleKey?: unknown;
		subtitleFilename?: unknown;
		announce?: unknown;
		reminderEnabled?: unknown;
	};
	if (body.action === 'status')
		return json({ operator: user, ...(await youtubeConnection(user.email)) });
	if (body.action === 'schedule') {
		const title = parseTitle(body.title, { required: true }) as string;
		if (title.length > 100) throw error(400, 'YouTube titles are limited to 100 characters');
		const description = parseDescription(body.description);
		const scheduledAt = parseScheduledAt(body.scheduledAt);
		const youtubeScheduledAt = new Date(Math.max(scheduledAt.getTime(), Date.now() + 60_000));
		const privacyStatus =
			body.privacyStatus === 'private' || body.privacyStatus === 'public'
				? body.privacyStatus
				: 'unlisted';
		let thumbnail = parseThumbnailPair(body.thumbnailUrl, body.thumbnailKey);
		const subtitle = parseSubtitleTriple(body.subtitleUrl, body.subtitleKey, body.subtitleFilename);
		if (!thumbnail.thumbnail_url) {
			const gate = await getBroadcastAdminState();
			if (gate.default_thumbnail_url && gate.default_thumbnail_s3_key) {
				thumbnail = {
					thumbnail_url: gate.default_thumbnail_url,
					thumbnail_s3_key: gate.default_thumbnail_s3_key
				};
			}
		}

		let youtube;
		try {
			youtube = await scheduleYouTubeLive(user.email, {
				title,
				description,
				scheduledAt: youtubeScheduledAt,
				privacyStatus
			});
		} catch (cause) {
			throw error(
				409,
				cause instanceof Error ? cause.message : 'YouTube schedule could not be created'
			);
		}

		let session;
		try {
			session = await createScheduledLive({
				title,
				description,
				thumbnail_url: thumbnail.thumbnail_url,
				thumbnail_s3_key: thumbnail.thumbnail_s3_key,
				youtube_url: youtube.youtubeUrl,
				subtitle_srt_url: subtitle.subtitle_srt_url,
				subtitle_srt_s3_key: subtitle.subtitle_srt_s3_key,
				subtitle_filename: subtitle.subtitle_filename,
				scheduled_at: scheduledAt,
				announce: body.announce === true,
				reminder_enabled: body.reminderEnabled === true,
				created_by: user.email
			});
		} catch (cause) {
			await deleteYouTubeLive(user.email, youtube.broadcastId).catch((rollbackError) => {
				console.error('[studio-youtube] rollback failed', rollbackError);
			});
			throw cause;
		}

		if (body.announce === true) {
			pingBroadcastEvent({ event: 'live-scheduled', scheduledLiveId: session._id });
		}
		await logAudit({
			user_id: user.email,
			user_email: user.email,
			action: 'create',
			target_collection: 'scheduled_lives',
			target_id: session._id,
			changes: {
				title: { old: null, new: session.title },
				scheduled_at: { old: null, new: session.scheduled_at },
				youtube_url: { old: null, new: youtube.youtubeUrl }
			},
			ip_address: getClientAddress()
		});
		return json({
			ok: true,
			session,
			shareUrl: buildWatchUrl(session.slug),
			youtubeUrl: youtube.youtubeUrl,
			ingest: youtube.ingest
		});
	}
	if (body.action === 'ingest') {
		if (typeof body.sessionId !== 'string') throw error(400, 'A scheduled session is required');
		const session = await getScheduledLiveById(body.sessionId);
		if (!session?.youtube_url || session.is_test)
			throw error(404, 'Scheduled YouTube session not found');
		try {
			return json({
				ingest: await youtubeIngest(user.email, session.youtube_url),
				youtubeUrl: session.youtube_url
			});
		} catch (cause) {
			throw error(409, cause instanceof Error ? cause.message : 'YouTube ingest is unavailable');
		}
	}
	if (body.action === 'go-live') {
		if (typeof body.sessionId !== 'string') throw error(400, 'A scheduled session is required');
		const session = await getScheduledLiveById(body.sessionId);
		if (!session || session.is_test || !['scheduled', 'live'].includes(session.status)) {
			throw error(404, 'Scheduled session not found');
		}
		if (!session.youtube_url)
			throw error(400, 'Add the scheduled YouTube link to this session first');
		try {
			return json({ ok: true, ...(await transitionYouTubeLive(user.email, session.youtube_url)) });
		} catch (cause) {
			throw error(409, cause instanceof Error ? cause.message : 'YouTube could not go live');
		}
	}
	throw error(400, 'Unknown action');
}
