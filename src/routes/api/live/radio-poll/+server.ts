import { json } from '@sveltejs/kit';
import { probeLiveAudio, getLiveAudioSourceUrl } from '$lib/server/live-audio';
import {
	claimCheckSlot,
	claimNotificationSlot,
	getRadioCachedStatus,
	setRadioCachedStatus,
	heartbeatListener,
	removeListener,
	countActiveListeners
} from '../../../../db/collections';
import { sendPushToAll, radioLivePayload } from '$lib/server/push-notifications';

const RADIO_NOTIFICATION_COOLDOWN = 10 * 60 * 1000; // 10 min cooldown
const RADIO_PROBE_INTERVAL = 10_000; // 10 seconds between probes

export async function GET({ url }) {
	const sid = url.searchParams.get('sid');

	// Heartbeat the listener if a session ID is provided
	if (sid) {
		heartbeatListener(sid).catch(() => {});
	}

	let status = await getRadioCachedStatus();

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

			// Send push notification on state change to live
			const wasLive = status?.isLive ?? false;
			if (newStatus.isLive && !wasLive) {
				console.log('[RadioPoll] Status changed: LIVE');
				claimNotificationSlot('radio_live', RADIO_NOTIFICATION_COOLDOWN)
					.then((canSend) => {
						if (canSend) {
							console.log('[RadioPoll] Radio is live. Sending push notification.');
							return sendPushToAll(radioLivePayload());
						}
					})
					.catch((e) => console.error('[RadioPoll] Radio push error:', e));
			} else if (!newStatus.isLive && wasLive) {
				console.log('[RadioPoll] Status changed: OFFLINE');
			}

			status = newStatus;
		} catch (error) {
			console.error('[RadioPoll] Probe error:', error);
			// Fall through to return cached status
		}
	}

	// Get listener count
	let listeners = 0;
	try {
		listeners = await countActiveListeners();
	} catch {
		// DB unavailable
	}

	return json({
		isLive: status?.isLive ?? false,
		checkedAt: status?.checkedAt ?? new Date().toISOString(),
		listeners,
		streamUrl: status?.streamUrl
	});
}

// Clean up listener on explicit disconnect
export async function DELETE({ url }) {
	const sid = url.searchParams.get('sid');
	if (sid) {
		await removeListener(sid).catch(() => {});
	}
	return json({ ok: true });
}
