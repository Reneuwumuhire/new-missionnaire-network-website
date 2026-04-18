import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import {
	getBroadcastAdminState,
	setBroadcastAdminState,
	logAudit
} from '../../../../db/collections';

export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	// `notify` is optional: defaults to true (normal behavior = fire push).
	// Pass `false` from admin UI to go live silently (local testing, re-broadcasts
	// after a technical glitch, etc.).
	let notify = true;
	try {
		const body = (await request.json().catch(() => ({}))) as { notify?: unknown };
		if (body.notify === false) notify = false;
	} catch {
		// Empty body is fine — stay with default `true`.
	}

	const current = await getBroadcastAdminState();
	if (current.is_live) {
		// Idempotent: already live → just return current state without re-firing the push.
		return json({ ok: true, alreadyLive: true, state: current });
	}

	const startedAt = new Date().toISOString();
	await setBroadcastAdminState({
		is_live: true,
		started_at: startedAt,
		ended_at: null,
		started_by: locals.user.email,
		started_by_name: locals.user.name || null,
		icecast_offline_since: null,
		// Picked up by the main-site radio-poll endpoint, which fires the actual
		// push notification (VAPID keys + web-push live there, not in admin).
		notification_pending: notify
	});

	// Ping the main-site radio-poll once so the push fires immediately, even if
	// no public visitor has /live open. Fire-and-forget — failure here must not
	// block the Go Live action; the flag stays pending and will be consumed by
	// the next natural radio-poll request from any visitor.
	if (env.MAIN_SITE_URL) {
		fetch(`${env.MAIN_SITE_URL.replace(/\/$/, '')}/api/live/radio-poll`, {
			method: 'GET',
			headers: { 'Cache-Control': 'no-cache' }
		}).catch((err) => {
			console.error('[broadcast/go-live] Main-site ping failed:', err);
		});
	} else {
		console.warn(
			'[broadcast/go-live] MAIN_SITE_URL not set — push may be delayed until a visitor loads /live'
		);
	}

	await logAudit({
		user_id: locals.user.email,
		user_email: locals.user.email,
		action: 'create',
		target_collection: 'broadcast_admin_state',
		target_id: 'current',
		changes: { is_live: { old: false, new: true }, notify: { old: null, new: notify } },
		ip_address: getClientAddress()
	});

	return json({ ok: true, startedAt, notify });
};
