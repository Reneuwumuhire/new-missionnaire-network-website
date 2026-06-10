import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import {
	getBroadcastAdminState,
	setBroadcastAdminState,
	setScheduledLiveStatus,
	logAudit
} from '../../../../db/collections';

export const POST: RequestHandler = async ({ locals, getClientAddress }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	// Bypass cache so a stale `is_live: false` doesn't make us skip the
	// is_live=false write that End Live needs to perform.
	const current = await getBroadcastAdminState({ fresh: true });
	if (!current.is_live) {
		return json({ ok: true, alreadyOffline: true, state: current });
	}

	const endedAt = new Date().toISOString();
	await setBroadcastAdminState({
		is_live: false,
		ended_at: endedAt,
		icecast_offline_since: null,
		notification_pending: false
	});

	// Close out the scheduled_lives entry this broadcast was linked to. The
	// gate keeps scheduled_live_id pointing at it (harmless — overwritten on
	// next go-live); the watch page resolves the replay lazily once published.
	if (current.scheduled_live_id) {
		await setScheduledLiveStatus(current.scheduled_live_id, 'ended', {
			live_ended_at: endedAt
		});
	}

	// Tell the main site to clear its Icecast cache and fan out an end-live
	// push so open tabs flip their radio banner off without reloading.
	// Fire-and-forget — failure is non-fatal; the cron clears stale Icecast
	// cache within a minute as a backstop.
	const internalSecret = env.INTERNAL_API_SECRET;
	if (env.MAIN_SITE_URL && internalSecret) {
		fetch(`${env.MAIN_SITE_URL.replace(/\/$/, '')}/api/internal/broadcast-event`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${internalSecret}`
			},
			body: JSON.stringify({ event: 'end-live' })
		}).catch((err) => {
			console.error('[broadcast/end-live] Main-site broadcast-event ping failed:', err);
		});
	}

	// Track when the admin ending the broadcast is not the same admin who
	// started it — soft lock: we don't block, but we surface it in the audit log.
	const startedBy = current.started_by ?? null;
	const isOverride = Boolean(startedBy) && startedBy !== locals.user.email;

	await logAudit({
		user_id: locals.user.email,
		user_email: locals.user.email,
		action: 'update',
		target_collection: 'broadcast_admin_state',
		target_id: 'current',
		changes: {
			is_live: { old: true, new: false },
			...(isOverride ? { override_started_by: { old: startedBy, new: null } } : {})
		},
		ip_address: getClientAddress()
	});

	return json({ ok: true, endedAt });
};
