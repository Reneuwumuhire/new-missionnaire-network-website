import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { createScheduledLive, getBroadcastAdminState, logAudit } from '../../../db/collections';
import { buildWatchUrl, pingBroadcastEvent } from '$lib/server/main-site';
import {
	parseTitle,
	parseDescription,
	parseThumbnailPair,
	parseSubtitleTriple,
	parseScheduledAt,
	parseYoutubeUrl
} from '$lib/server/scheduled-live-validation';

export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const body = (await request.json()) as {
		title?: unknown;
		description?: unknown;
		thumbnail_url?: unknown;
		thumbnail_s3_key?: unknown;
		subtitle_srt_url?: unknown;
		subtitle_srt_s3_key?: unknown;
		subtitle_filename?: unknown;
		youtube_url?: unknown;
		scheduled_at?: unknown;
		announce?: unknown;
		reminder_enabled?: unknown;
	};

	const title = parseTitle(body.title, { required: true });
	const description = parseDescription(body.description);
	const youtubeUrl = parseYoutubeUrl(body.youtube_url);
	let thumbnail = parseThumbnailPair(body.thumbnail_url, body.thumbnail_s3_key);
	const subtitle = parseSubtitleTriple(
		body.subtitle_srt_url,
		body.subtitle_srt_s3_key,
		body.subtitle_filename
	);
	const scheduledAt = parseScheduledAt(body.scheduled_at);
	const announce = body.announce === true;

	// No thumbnail picked → fall back to the stored default so the waiting
	// room and the share-link preview always have an image (same fallback the
	// go-live handler applies to the broadcast gate).
	if (!thumbnail.thumbnail_url) {
		const gate = await getBroadcastAdminState();
		if (gate.default_thumbnail_url && gate.default_thumbnail_s3_key) {
			thumbnail = {
				thumbnail_url: gate.default_thumbnail_url,
				thumbnail_s3_key: gate.default_thumbnail_s3_key
			};
		}
	}

	const live = await createScheduledLive({
		title: title as string,
		description,
		thumbnail_url: thumbnail.thumbnail_url,
		thumbnail_s3_key: thumbnail.thumbnail_s3_key,
		youtube_url: youtubeUrl,
		subtitle_srt_url: subtitle.subtitle_srt_url,
		subtitle_srt_s3_key: subtitle.subtitle_srt_s3_key,
		subtitle_filename: subtitle.subtitle_filename,
		scheduled_at: scheduledAt,
		announce,
		reminder_enabled: body.reminder_enabled === true,
		created_by: locals.user.email
	});

	if (announce) {
		pingBroadcastEvent({ event: 'live-scheduled', scheduledLiveId: live._id });
	}

	await logAudit({
		user_id: locals.user.email,
		user_email: locals.user.email,
		action: 'create',
		target_collection: 'scheduled_lives',
		target_id: live._id,
		changes: {
			title: { old: null, new: live.title },
			scheduled_at: { old: null, new: live.scheduled_at },
			announce: { old: null, new: announce }
		},
		ip_address: getClientAddress()
	});

	return json({ ok: true, live, shareUrl: buildWatchUrl(live.slug) });
};
