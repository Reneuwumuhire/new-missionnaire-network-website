import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import {
	getBroadcastAdminState,
	setBroadcastAdminState,
	getScheduledLiveById,
	findLinkableScheduledLive,
	createScheduledLive,
	setScheduledLiveStatus,
	logAudit,
	type ScheduledLive
} from '../../../../db/collections';

// Same fallbacks the upload modal uses when no default has been configured —
// keeps an ad-hoc live's title/description sensible out of the box.
const FALLBACK_DEFAULT_TITLE = '{date} Missionnaire Network Live audio';
const FALLBACK_DEFAULT_DESCRIPTION =
	'Rediffusion du direct de Missionnaire Network — prédications, enseignements et louanges.';

/** YYYY-MM-DD in the broadcast's home timezone (Berlin), mirroring the
 *  client-side title rendering so ad-hoc and scheduled lives read the same. */
function berlinDateYmd(d: Date): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Europe/Berlin',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(d);
	const y = parts.find((p) => p.type === 'year')?.value ?? '';
	const m = parts.find((p) => p.type === 'month')?.value ?? '';
	const day = parts.find((p) => p.type === 'day')?.value ?? '';
	return `${y}-${m}-${day}`;
}

/** Substitute {date}, or prepend today's date so a title is never dateless. */
function renderDefaultTitle(template: string): string {
	const date = berlinDateYmd(new Date());
	return template.includes('{date}') ? template.replaceAll('{date}', date) : `${date} ${template}`;
}

export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	// `notify` is optional: defaults to true (normal behavior = fire push).
	// Pass `false` from admin UI to go live silently (local testing, re-broadcasts
	// after a technical glitch, etc.).
	// `scheduledLiveId` explicitly attaches this broadcast to a scheduled entry
	// (the "Démarrer le direct" button). Without it we auto-link the nearest
	// upcoming entry, or back-fill a new one so even ad-hoc lives get a stable
	// watch URL.
	// `useDefaults` forces an immediate live off the saved default info, skipping
	// the auto-link — the "go live now with defaults" button for unscheduled lives.
	let notify = true;
	let scheduledLiveId: string | null = null;
	let useDefaults = false;
	try {
		const body = (await request.json().catch(() => ({}))) as {
			notify?: unknown;
			scheduledLiveId?: unknown;
			useDefaults?: unknown;
		};
		if (body.notify === false) notify = false;
		if (typeof body.scheduledLiveId === 'string' && body.scheduledLiveId) {
			scheduledLiveId = body.scheduledLiveId;
		}
		if (body.useDefaults === true) useDefaults = true;
	} catch {
		// Empty body is fine — stay with defaults.
	}

	// Bypass the per-process cache — a stale `is_live: true` here would skip
	// the notification_pending write below and the push would never fire.
	const current = await getBroadcastAdminState({ fresh: true });
	if (current.is_live) {
		// Idempotent: already live → just return current state without re-firing the push.
		return json({ ok: true, alreadyLive: true, state: current });
	}

	const startedAt = new Date().toISOString();

	// Resolve the scheduled_lives entry this broadcast airs. This entry is the
	// single source of truth for the live's metadata — the gate is reset from
	// it below, so a recording started during this live can never inherit the
	// title/description/thumbnail of a previous broadcast.
	let entry: ScheduledLive | null = null;
	if (scheduledLiveId) {
		entry = await getScheduledLiveById(scheduledLiveId);
		if (!entry) throw error(404, 'Direct programmé introuvable');
		if (entry.status !== 'scheduled') {
			throw error(400, 'Ce direct programmé a déjà été diffusé ou annulé');
		}
	} else if (!useDefaults) {
		// Plain "Go Live" still attaches to a nearby scheduled entry when one
		// exists, so its prepared metadata is used. `useDefaults` skips this.
		entry = await findLinkableScheduledLive(new Date());
	}
	if (!entry) {
		// Immediate, unscheduled live: back-fill an entry from the saved default
		// info so the share link (/live/<slug>) exists and the live + recording
		// show consistent values. Sourced purely from defaults — never from the
		// previous broadcast's gate metadata.
		entry = await createScheduledLive({
			title: renderDefaultTitle(current.default_title?.trim() || FALLBACK_DEFAULT_TITLE),
			description: current.default_description?.trim() || FALLBACK_DEFAULT_DESCRIPTION,
			thumbnail_url: current.default_thumbnail_url ?? null,
			thumbnail_s3_key: current.default_thumbnail_s3_key ?? null,
			youtube_url: current.default_youtube_url ?? null,
			scheduled_at: new Date(startedAt),
			status: 'live',
			live_started_at: startedAt,
			created_by: locals.user.email
		});
	}

	// Effective thumbnail for this broadcast: the entry's own, falling back to
	// the stored default so an instant live still gets the channel image. The
	// gate value is what the public live page, the push image AND the recorder
	// snapshot (recordings list thumbnail) all read.
	const thumbUrl = entry.thumbnail_url ?? current.default_thumbnail_url ?? null;
	const thumbKey = entry.thumbnail_url
		? entry.thumbnail_s3_key
		: (current.default_thumbnail_url ? current.default_thumbnail_s3_key : null);

	await setBroadcastAdminState({
		is_live: true,
		started_at: startedAt,
		ended_at: null,
		started_by: locals.user.email,
		started_by_name: locals.user.name || null,
		icecast_offline_since: null,
		scheduled_live_id: entry._id,
		scheduled_live_slug: entry.slug,
		// Fully reset the gate metadata from the resolved entry — every field is
		// written (cleared when the entry has none) so nothing carries over from
		// a previous live. The public live page / push / recorder snapshot all
		// read these.
		title: entry.title,
		description: entry.description ?? null,
		thumbnail_url: thumbUrl,
		thumbnail_s3_key: thumbUrl ? (thumbKey ?? null) : null,
		youtube_url: entry.youtube_url ?? null,
		// Subtitle transcript for this broadcast: copied from the entry so the
		// public radio-state endpoint can serve it without an extra lookup. The
		// anchor is always reset — it's set by the admin "Start subtitles" button
		// once the subtitled audio actually starts playing on air.
		subtitle_srt_url: entry.subtitle_srt_url ?? null,
		subtitle_srt_s3_key: entry.subtitle_srt_s3_key ?? null,
		subtitle_anchor_epoch_ms: null,
		subtitle_offset_ms: 0,
		// Picked up by the main-site radio-poll endpoint, which fires the actual
		// push notification (VAPID keys + web-push live there, not in admin).
		notification_pending: notify
	});

	if (entry.status !== 'live') {
		await setScheduledLiveStatus(entry._id, 'live', { live_started_at: startedAt });
	}

	// Ping the main-site internal broadcast-event endpoint so the push fires
	// immediately. Fire-and-forget — failure here must not block the Go Live
	// action; the flag stays pending and the main-site cron picks it up as a
	// backstop on its next minute tick.
	const internalSecret = env.INTERNAL_API_SECRET;
	if (env.MAIN_SITE_URL && internalSecret) {
		fetch(`${env.MAIN_SITE_URL.replace(/\/$/, '')}/api/internal/broadcast-event`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${internalSecret}`
			},
			body: JSON.stringify({ event: 'go-live' })
		}).catch((err) => {
			console.error('[broadcast/go-live] Main-site broadcast-event ping failed:', err);
		});
	} else {
		console.warn(
			'[broadcast/go-live] MAIN_SITE_URL or INTERNAL_API_SECRET not set — push will be delayed until the main-site cron fires (≤60s)'
		);
	}

	await logAudit({
		user_id: locals.user.email,
		user_email: locals.user.email,
		action: 'create',
		target_collection: 'broadcast_admin_state',
		target_id: 'current',
		changes: {
			is_live: { old: false, new: true },
			notify: { old: null, new: notify },
			scheduled_live: { old: null, new: entry._id }
		},
		ip_address: getClientAddress()
	});

	return json({ ok: true, startedAt, notify, watchPath: `/live/${entry.slug}` });
};
