import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import {
	getScheduledLiveById,
	updateScheduledLive,
	deleteScheduledLive,
	isThumbnailS3KeyReferenced,
	getBroadcastAdminState,
	setBroadcastAdminState,
	logAudit
} from '../../../../db/collections';
import { deleteObject } from '$lib/server/s3';
import { pingBroadcastEvent } from '$lib/server/main-site';
import {
	parseTitle,
	parseDescription,
	parseThumbnailPair,
	parseSubtitleTriple,
	parseScheduledAt,
	parseYoutubeUrl
} from '$lib/server/scheduled-live-validation';

export const PATCH: RequestHandler = async ({ locals, params, request, getClientAddress }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const current = await getScheduledLiveById(params.id);
	if (!current) throw error(404, 'Direct programmé introuvable');
	// A scheduled entry is fully editable; a live one can have its on-air
	// metadata (title/description/youtube/thumbnail) corrected mid-broadcast —
	// scheduling-only fields (date, reminder, announce) are frozen once live.
	const isLive = current.status === 'live';
	if (current.status !== 'scheduled' && !isLive) {
		throw error(400, 'Seul un direct programmé ou en cours peut être modifié');
	}

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
		reminder_enabled?: unknown;
		announce?: unknown;
	};

	const updates: Parameters<typeof updateScheduledLive>[1] = {};

	if ('title' in body) {
		const title = parseTitle(body.title, { required: true });
		updates.title = title as string;
	}
	if ('description' in body) updates.description = parseDescription(body.description);
	if ('youtube_url' in body) updates.youtube_url = parseYoutubeUrl(body.youtube_url);
	// Date/reminder only make sense before the live starts — ignore them once on air.
	if (!isLive && 'scheduled_at' in body) updates.scheduled_at = parseScheduledAt(body.scheduled_at);
	if (!isLive && 'reminder_enabled' in body) updates.reminder_enabled = body.reminder_enabled === true;

	if ('thumbnail_url' in body || 'thumbnail_s3_key' in body) {
		const pair = parseThumbnailPair(body.thumbnail_url, body.thumbnail_s3_key);
		updates.thumbnail_url = pair.thumbnail_url;
		updates.thumbnail_s3_key = pair.thumbnail_s3_key;
	}

	if ('subtitle_srt_url' in body || 'subtitle_srt_s3_key' in body || 'subtitle_filename' in body) {
		const triple = parseSubtitleTriple(
			body.subtitle_srt_url,
			body.subtitle_srt_s3_key,
			body.subtitle_filename
		);
		updates.subtitle_srt_url = triple.subtitle_srt_url;
		updates.subtitle_srt_s3_key = triple.subtitle_srt_s3_key;
		updates.subtitle_filename = triple.subtitle_filename;
	}

	// Re-announce request: only meaningful before the live, and if not already
	// announced/pending.
	const announce =
		!isLive && body.announce === true && !current.announce_pending && !current.announced_at;
	if (announce) updates.announce_pending = true;

	if (Object.keys(updates).length === 0) throw error(400, 'Aucune modification fournie');

	await updateScheduledLive(params.id, updates);

	// Editing the entry that's currently on air: mirror its public-facing
	// metadata into the broadcast gate so the live page, push image and recorder
	// snapshot pick up the correction immediately. Done before the thumbnail
	// cleanup below so the reference check sees the gate's new key.
	if (isLive) {
		const gate = await getBroadcastAdminState({ fresh: true });
		if (gate.is_live && gate.scheduled_live_id === params.id) {
			const gateUpdates: {
				title?: string | null;
				description?: string | null;
				youtube_url?: string | null;
				thumbnail_url?: string | null;
				thumbnail_s3_key?: string | null;
			} = {};
			if ('title' in updates) gateUpdates.title = updates.title ?? null;
			if ('description' in updates) gateUpdates.description = updates.description ?? null;
			if ('youtube_url' in updates) gateUpdates.youtube_url = updates.youtube_url ?? null;
			if ('thumbnail_url' in updates) {
				gateUpdates.thumbnail_url = updates.thumbnail_url ?? null;
				gateUpdates.thumbnail_s3_key = updates.thumbnail_s3_key ?? null;
			}
			if (Object.keys(gateUpdates).length > 0) await setBroadcastAdminState(gateUpdates);
		}
	}

	// Replacing/clearing the thumbnail: delete the old S3 object unless still
	// referenced elsewhere (other scheduled lives, recordings, broadcast state).
	const oldKey = current.thumbnail_s3_key;
	const isReplacingThumbnail =
		'thumbnail_s3_key' in updates && oldKey && updates.thumbnail_s3_key !== oldKey;
	if (isReplacingThumbnail) {
		if (!(await isThumbnailS3KeyReferenced(oldKey, { excludeScheduledLiveId: params.id }))) {
			deleteObject(oldKey).catch((err) =>
				console.error('[scheduled-lives] old thumbnail delete failed:', err)
			);
		}
	}

	// Replacing/clearing the SRT: delete the old object. Unlike thumbnails,
	// subtitle files are never shared across entries, so no reference check.
	const oldSubtitleKey = current.subtitle_srt_s3_key;
	if (
		'subtitle_srt_s3_key' in updates &&
		oldSubtitleKey &&
		updates.subtitle_srt_s3_key !== oldSubtitleKey
	) {
		deleteObject(oldSubtitleKey).catch((err) =>
			console.error('[scheduled-lives] old subtitle delete failed:', err)
		);
	}

	if (announce) {
		pingBroadcastEvent({ event: 'live-scheduled', scheduledLiveId: params.id });
	}

	await logAudit({
		user_id: locals.user.email,
		user_email: locals.user.email,
		action: 'update',
		target_collection: 'scheduled_lives',
		target_id: params.id,
		changes: Object.fromEntries(
			Object.entries(updates).map(([k, v]) => [
				k,
				{ old: (current as unknown as Record<string, unknown>)[k] ?? null, new: v }
			])
		) as Record<string, { old: unknown; new: unknown }>,
		ip_address: getClientAddress()
	});

	const updated = await getScheduledLiveById(params.id);
	return json({ ok: true, live: updated });
};

export const DELETE: RequestHandler = async ({ locals, params, getClientAddress }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const current = await getScheduledLiveById(params.id);
	if (!current) throw error(404, 'Direct programmé introuvable');
	if (current.status === 'live') {
		throw error(400, 'Impossible de supprimer un direct en cours');
	}

	const deleted = await deleteScheduledLive(params.id);
	if (deleted?.thumbnail_s3_key) {
		if (!(await isThumbnailS3KeyReferenced(deleted.thumbnail_s3_key))) {
			deleteObject(deleted.thumbnail_s3_key).catch((err) =>
				console.error('[scheduled-lives] thumbnail delete failed:', err)
			);
		}
	}
	if (deleted?.subtitle_srt_s3_key) {
		deleteObject(deleted.subtitle_srt_s3_key).catch((err) =>
			console.error('[scheduled-lives] subtitle delete failed:', err)
		);
	}

	await logAudit({
		user_id: locals.user.email,
		user_email: locals.user.email,
		action: 'delete',
		target_collection: 'scheduled_lives',
		target_id: params.id,
		changes: { title: { old: current.title, new: null } },
		ip_address: getClientAddress()
	});

	return json({ ok: true });
};
