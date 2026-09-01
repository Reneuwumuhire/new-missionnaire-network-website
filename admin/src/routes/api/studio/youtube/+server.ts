import { error, json } from '@sveltejs/kit';
import { getPermissions, type AdminUser } from '$lib/models/admin-user';
import { getDb } from '../../../../db/mongo';
import {
	createScheduledLive,
	getBroadcastAdminState,
	getScheduledLiveById,
	logAudit
} from '../../../../db/collections';
import {
	completeYouTubeLive,
	deleteYouTubeLive,
	disconnectYouTube,
	scheduleYouTubeLive,
	transitionYouTubeLive,
	youtubeConnection,
	youtubeIngest
} from '$lib/server/youtube-oauth';
import { validateYouTubeThumbnail } from '$lib/server/youtube-oauth-core';
import {
	parseDescription,
	parseScheduledAt,
	parseSubtitleTriple,
	parseThumbnailPair,
	parseTitle
} from '$lib/server/scheduled-live-validation';
import { buildWatchUrl, pingBroadcastEvent } from '$lib/server/main-site';
import { generatePresignedUploadUrl, getObjectBytes, getS3Url } from '$lib/server/s3';
import { RecorderError, recorderStart, recorderStop } from '$lib/server/recorder-client';
import {
	missionnaireIngestForAuthorization,
	revokeMissionnaireIngest,
	updateStudioAuthorizationActivity
} from '$lib/server/studio-ingest';

async function operator(request: Request) {
	const code = request.headers.get('authorization')?.replace(/^Bearer\s+/, '') ?? '';
	const doc = await (await getDb()).collection('studio_authorizations').findOne({
		code,
		revoked_at: { $exists: false },
		expires_at: { $gt: new Date() }
	});
	if (!doc || typeof doc.user_email !== 'string')
		throw error(401, 'Authorize Studio in the admin app first');
	const admin = await (await getDb()).collection('admin_users').findOne({
		email: doc.user_email,
		is_active: { $ne: false }
	});
	if (!admin || !getPermissions(admin as unknown as AdminUser).can_manage_recordings) {
		await revokeMissionnaireIngest(code);
		throw error(403, 'Broadcasting permission required');
	}
	return {
		code,
		authorization: doc,
		email: doc.user_email,
		name: typeof doc.user_name === 'string' ? doc.user_name : doc.user_email
	};
}

async function sessionChannelId(
	userEmail: string,
	saved: string | null | undefined
): Promise<string> {
	if (saved) return saved;
	const channels = await youtubeConnection(userEmail);
	if (channels.length === 1) return channels[0].id;
	throw error(409, 'This older session is not linked to one YouTube channel');
}

export async function POST({ request, getClientAddress }) {
	const body = (await request.json().catch(() => ({}))) as {
		action?: string;
		sessionId?: string;
		title?: unknown;
		description?: unknown;
		scheduledAt?: unknown;
		privacyStatus?: unknown;
		madeForKids?: unknown;
		thumbnailUrl?: unknown;
		thumbnailKey?: unknown;
		subtitleUrl?: unknown;
		subtitleKey?: unknown;
		subtitleFilename?: unknown;
		announce?: unknown;
		reminderEnabled?: unknown;
		filename?: unknown;
		contentType?: unknown;
		size?: unknown;
		channelId?: unknown;
		deviceInfo?: unknown;
	};
	if (body.action === 'logout') {
		const code = request.headers.get('authorization')?.replace(/^Bearer\s+/, '') ?? '';
		await revokeMissionnaireIngest(code);
		return json({ ok: true });
	}
	const user = await operator(request);
	if (body.action === 'status' || body.action === 'heartbeat') {
		await updateStudioAuthorizationActivity(user.code, body.deviceInfo);
	}
	if (body.action === 'heartbeat') return json({ ok: true });
	if (body.action === 'status') {
		const [channels, missionnaire] = await Promise.all([
			youtubeConnection(user.email),
			missionnaireIngestForAuthorization(user.code, user.authorization)
				.then((ingest) => ({ ingest, error: null }))
				.catch((cause) => ({
					ingest: null,
					error: cause instanceof Error ? cause.message : 'Missionnaire ingest is unavailable'
				}))
		]);
		return json({
			operator: { email: user.email, name: user.name },
			connected: channels.length > 0,
			channelTitle: channels[0]?.title ?? null,
			channels,
			missionnaireIngest: missionnaire.ingest,
			missionnaireError: missionnaire.error
		});
	}
	if (body.action === 'disconnect') {
		if (typeof body.channelId !== 'string') throw error(400, 'A YouTube channel is required');
		await disconnectYouTube(user.email, body.channelId);
		return json({ ok: true });
	}
	if (body.action === 'recorder-start') {
		try {
			const result = await recorderStart(user.email, user.name || null);
			await logAudit({
				user_id: user.email,
				user_email: user.email,
				action: 'create',
				target_collection: 'recordings',
				target_id: result.id,
				ip_address: getClientAddress()
			}).catch((auditError) => console.error('[Studio recorder] start audit failed:', auditError));
			return json(result);
		} catch (cause) {
			if (cause instanceof RecorderError) throw error(cause.status, cause.message);
			throw cause;
		}
	}
	if (body.action === 'recorder-stop') {
		try {
			const result = await recorderStop();
			await logAudit({
				user_id: user.email,
				user_email: user.email,
				action: 'update',
				target_collection: 'recordings',
				target_id: result.id,
				changes: { status: { old: 'recording', new: 'uploading' } },
				ip_address: getClientAddress()
			}).catch((auditError) => console.error('[Studio recorder] stop audit failed:', auditError));
			return json(result);
		} catch (cause) {
			if (cause instanceof RecorderError) throw error(cause.status, cause.message);
			throw cause;
		}
	}
	if (body.action === 'presign-thumbnail') {
		const contentType = typeof body.contentType === 'string' ? body.contentType : '';
		const size = typeof body.size === 'number' ? body.size : 0;
		try {
			validateYouTubeThumbnail(contentType, size);
		} catch (cause) {
			throw error(400, cause instanceof Error ? cause.message : 'Invalid YouTube thumbnail');
		}
		const ext = contentType === 'image/png' ? 'png' : 'jpg';
		const key = `broadcast-thumbnails/${Date.now()}-${crypto.randomUUID()}.${ext}`;
		return json({
			uploadUrl: await generatePresignedUploadUrl(key, contentType),
			key,
			publicUrl: getS3Url(key)
		});
	}
	if (body.action === 'presign-subtitle') {
		const filename = typeof body.filename === 'string' ? body.filename : '';
		const size = typeof body.size === 'number' ? body.size : 0;
		if (!filename.toLowerCase().endsWith('.srt') || size <= 0 || size > 2 * 1024 * 1024) {
			throw error(400, 'Subtitle must be an .srt file under 2 MB');
		}
		const key = `subtitles/${Date.now()}-${crypto.randomUUID()}.srt`;
		const contentType = 'text/plain; charset=utf-8';
		return json({
			uploadUrl: await generatePresignedUploadUrl(key, contentType),
			key,
			publicUrl: getS3Url(key),
			contentType
		});
	}
	if (body.action === 'schedule') {
		if (typeof body.channelId !== 'string') throw error(400, 'Choose a YouTube channel');
		const title = parseTitle(body.title, { required: true }) as string;
		if (title.length > 100) throw error(400, 'YouTube titles are limited to 100 characters');
		const description = parseDescription(body.description);
		const scheduledAt = parseScheduledAt(body.scheduledAt);
		const youtubeScheduledAt = new Date(Math.max(scheduledAt.getTime(), Date.now() + 60_000));
		const privacyStatus =
			body.privacyStatus === 'private' || body.privacyStatus === 'public'
				? body.privacyStatus
				: 'unlisted';
		const madeForKids = body.madeForKids === true;
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
			let youtubeThumbnail;
			if (thumbnail.thumbnail_s3_key) {
				youtubeThumbnail = await getObjectBytes(thumbnail.thumbnail_s3_key);
				validateYouTubeThumbnail(youtubeThumbnail.contentType, youtubeThumbnail.bytes.byteLength);
			}
			youtube = await scheduleYouTubeLive(user.email, body.channelId, {
				title,
				description,
				scheduledAt: youtubeScheduledAt,
				privacyStatus,
				madeForKids,
				thumbnail: youtubeThumbnail
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
				youtube_channel_id: youtube.channelId,
				youtube_channel_title: youtube.channelTitle,
				subtitle_srt_url: subtitle.subtitle_srt_url,
				subtitle_srt_s3_key: subtitle.subtitle_srt_s3_key,
				subtitle_filename: subtitle.subtitle_filename,
				scheduled_at: scheduledAt,
				announce: body.announce === true,
				reminder_enabled: body.reminderEnabled === true,
				created_by: user.email
			});
		} catch (cause) {
			await deleteYouTubeLive(user.email, youtube.channelId, youtube.broadcastId).catch(
				(rollbackError) => {
					console.error('[studio-youtube] rollback failed', rollbackError);
				}
			);
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
			const channelId = await sessionChannelId(user.email, session.youtube_channel_id);
			return json({
				ingest: await youtubeIngest(user.email, channelId, session.youtube_url),
				channelId,
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
			const channelId = await sessionChannelId(user.email, session.youtube_channel_id);
			return json({
				ok: true,
				...(await transitionYouTubeLive(user.email, channelId, session.youtube_url))
			});
		} catch (cause) {
			throw error(409, cause instanceof Error ? cause.message : 'YouTube could not go live');
		}
	}
	if (body.action === 'end-live') {
		if (typeof body.sessionId !== 'string') throw error(400, 'A scheduled session is required');
		const session = await getScheduledLiveById(body.sessionId);
		if (!session || session.is_test) throw error(404, 'Scheduled session not found');
		if (!session.youtube_url)
			throw error(400, 'Add the scheduled YouTube link to this session first');
		try {
			const channelId = await sessionChannelId(user.email, session.youtube_channel_id);
			return json({
				ok: true,
				...(await completeYouTubeLive(user.email, channelId, session.youtube_url))
			});
		} catch (cause) {
			throw error(409, cause instanceof Error ? cause.message : 'YouTube could not end the live');
		}
	}
	throw error(400, 'Unknown action');
}
