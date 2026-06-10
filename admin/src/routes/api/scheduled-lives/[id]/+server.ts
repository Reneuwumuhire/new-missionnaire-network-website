import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import {
	getScheduledLiveById,
	updateScheduledLive,
	deleteScheduledLive,
	isThumbnailS3KeyReferenced,
	logAudit
} from '../../../../db/collections';
import { deleteObject } from '$lib/server/s3';
import { pingBroadcastEvent } from '$lib/server/main-site';
import {
	parseTitle,
	parseDescription,
	parseThumbnailPair,
	parseScheduledAt
} from '$lib/server/scheduled-live-validation';

export const PATCH: RequestHandler = async ({ locals, params, request, getClientAddress }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const current = await getScheduledLiveById(params.id);
	if (!current) throw error(404, 'Direct programmé introuvable');
	if (current.status !== 'scheduled') {
		throw error(400, 'Seul un direct encore programmé peut être modifié');
	}

	const body = (await request.json()) as {
		title?: unknown;
		description?: unknown;
		thumbnail_url?: unknown;
		thumbnail_s3_key?: unknown;
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
	if ('scheduled_at' in body) updates.scheduled_at = parseScheduledAt(body.scheduled_at);
	if ('reminder_enabled' in body) updates.reminder_enabled = body.reminder_enabled === true;

	if ('thumbnail_url' in body || 'thumbnail_s3_key' in body) {
		const pair = parseThumbnailPair(body.thumbnail_url, body.thumbnail_s3_key);
		updates.thumbnail_url = pair.thumbnail_url;
		updates.thumbnail_s3_key = pair.thumbnail_s3_key;
	}

	// Re-announce request: only meaningful if not already announced/pending.
	const announce = body.announce === true && !current.announce_pending && !current.announced_at;
	if (announce) updates.announce_pending = true;

	if (Object.keys(updates).length === 0) throw error(400, 'Aucune modification fournie');

	await updateScheduledLive(params.id, updates);

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
