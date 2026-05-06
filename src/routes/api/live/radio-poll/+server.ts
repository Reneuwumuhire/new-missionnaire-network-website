import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { probeLiveAudio, getLiveAudioSourceUrl } from '$lib/server/live-audio';
import {
	claimCheckSlot,
	getRadioCachedStatus,
	setRadioCachedStatus,
	heartbeatListener,
	removeListener,
	countActiveListeners,
	getBroadcastAdminState,
	setBroadcastAdminState
} from '../../../../db/collections';
import { checkAndIngestLiveStream } from '$lib/server/youtube-poller';
import { sendPushToAll, radioLivePayload } from '$lib/server/push-notifications';

const RADIO_PROBE_INTERVAL = 10_000; // 10 seconds between probes

// Grace window before the auto-end safety closes the broadcast gate when
// Icecast goes offline. Tolerates streamer uplink dropouts on poor networks
// without prematurely ending the broadcast (and stranding the in-flight
// recording, which the Fly.io recorder finalizes when its Icecast read EOFs).
// Override via ICECAST_OFFLINE_AUTO_END_MS env var.
const ICECAST_OFFLINE_AUTO_END_MS = (() => {
	const raw = Number(env.ICECAST_OFFLINE_AUTO_END_MS);
	return Number.isFinite(raw) && raw > 0 ? raw : 300_000;
})();

export async function GET({ url, setHeaders }) {
	const sid = url.searchParams.get('sid');

	// Prevent any intermediate cache (browser, CDN, Vercel edge) from serving
	// stale title/thumbnail/listener data. The client polls every 10s and
	// expects fresh values every request.
	setHeaders({
		'Cache-Control': 'no-store, no-cache, must-revalidate',
		Pragma: 'no-cache'
	});

	// Heartbeat the listener if a session ID is provided
	if (sid) {
		heartbeatListener(sid).catch(() => {});
	}

	let status = await getRadioCachedStatus();
	let adminGate = await getBroadcastAdminState();

	// Try to claim the probe slot — only one instance probes per interval
	const canProbe = await claimCheckSlot('radio_probe', RADIO_PROBE_INTERVAL);

	if (canProbe) {
		try {
			const probe = await probeLiveAudio(fetch);
			const newStatus = {
				isLive: probe.isLive,
				checkedAt: new Date().toISOString(),
				streamUrl: probe.isLive ? getLiveAudioSourceUrl() : undefined
			};

			await setRadioCachedStatus(newStatus);

			const wasLive = status?.isLive ?? false;
			if (newStatus.isLive && !wasLive) {
				console.log('[RadioPoll] Icecast: LIVE');
				// Radio just went live — YouTube likely started too.
				// Trigger an immediate YouTube check (force bypasses the 5-min throttle).
				checkAndIngestLiveStream(true).catch((e) =>
					console.error('[RadioPoll] YouTube check triggered by radio error:', e)
				);
			} else if (!newStatus.isLive && wasLive) {
				console.log('[RadioPoll] Icecast: OFFLINE');
			}

			// Auto-end safety: if admin opened the gate but Icecast has been offline for >60s,
			// flip the gate closed so the public site doesn't show a stalled "live" indicator.
			adminGate = await applyAutoEndSafety(adminGate, newStatus.isLive);

			status = newStatus;
		} catch (error) {
			console.error('[RadioPoll] Probe error:', error);
			// Fall through to return cached status
		}
	}

	// Consume notification_pending outside the probe gate — the push must fire
	// the moment admin opens the gate, regardless of whether we just probed.
	// The admin go-live endpoint also pings this endpoint directly to ensure
	// at least one consumer runs right after the click.
	if (adminGate.is_live && adminGate.notification_pending) {
		await setBroadcastAdminState({ notification_pending: false });
		adminGate = { ...adminGate, notification_pending: false };
		console.log('[RadioPoll] Sending Go Live push notification (admin-triggered)');
		sendPushToAll(radioLivePayload({ thumbnailUrl: adminGate.thumbnail_url })).catch((e) =>
			console.error('[RadioPoll] Push send failed:', e)
		);
	}

	// Get listener count
	let listeners = 0;
	try {
		listeners = await countActiveListeners();
	} catch {
		// DB unavailable
	}

	const icecastLive = status?.isLive ?? false;
	const isLive = icecastLive && adminGate.is_live;

	return json({
		isLive,
		checkedAt: status?.checkedAt ?? new Date().toISOString(),
		listeners,
		streamUrl: status?.streamUrl,
		title: adminGate.title,
		description: adminGate.description,
		thumbnailUrl: adminGate.thumbnail_url
	});
}

/**
 * If the admin gate is open but Icecast has been offline longer than
 * ICECAST_OFFLINE_AUTO_END_MS, close the gate. Tracks the start of the
 * offline window in `broadcast_admin_state.icecast_offline_since`. Resets
 * that timestamp whenever Icecast is detected live again.
 *
 * Returns the (possibly updated) admin gate state.
 */
async function applyAutoEndSafety(
	current: Awaited<ReturnType<typeof getBroadcastAdminState>>,
	icecastLive: boolean
): Promise<Awaited<ReturnType<typeof getBroadcastAdminState>>> {
	if (!current.is_live) {
		// Gate already closed — nothing to do, but keep timestamp clean.
		if (current.icecast_offline_since) {
			await setBroadcastAdminState({ icecast_offline_since: null });
			return { ...current, icecast_offline_since: null };
		}
		return current;
	}

	if (icecastLive) {
		// Stream is healthy — clear any stale "offline since" mark.
		if (current.icecast_offline_since) {
			await setBroadcastAdminState({ icecast_offline_since: null });
			return { ...current, icecast_offline_since: null };
		}
		return current;
	}

	// Gate open AND Icecast offline — start or check the timer.
	const now = Date.now();
	if (!current.icecast_offline_since) {
		const stamp = new Date(now).toISOString();
		await setBroadcastAdminState({ icecast_offline_since: stamp });
		return { ...current, icecast_offline_since: stamp };
	}

	const offlineFor = now - new Date(current.icecast_offline_since).getTime();
	if (offlineFor >= ICECAST_OFFLINE_AUTO_END_MS) {
		console.log(
			`[RadioPoll] Auto-ending broadcast: Icecast offline >${Math.round(ICECAST_OFFLINE_AUTO_END_MS / 1000)}s with gate open`
		);
		await setBroadcastAdminState({
			is_live: false,
			ended_at: new Date(now).toISOString(),
			icecast_offline_since: null
		});
		return {
			...current,
			is_live: false,
			ended_at: new Date(now).toISOString(),
			icecast_offline_since: null
		};
	}

	return current;
}

// Clean up listener on explicit disconnect
export async function DELETE({ url }) {
	const sid = url.searchParams.get('sid');
	if (sid) {
		await removeListener(sid).catch(() => {});
	}
	return json({ ok: true });
}
