import { json } from '@sveltejs/kit';
import { getLiveAudioSourceUrl } from '$lib/server/live-audio';
import {
	getRadioCachedStatus,
	getBroadcastAdminState,
	countActiveListeners,
	heartbeatListener
} from '../../../../db/collections';

export async function GET({ url, setHeaders }) {
	setHeaders({
		'Cache-Control': 'no-store, no-cache, must-revalidate',
		Pragma: 'no-cache'
	});

	// Optional listener heartbeat — lets the player do `/radio-state?sid=...`
	// for its initial paint and register the listener in one round trip.
	const sid = url.searchParams.get('sid');
	if (sid) {
		heartbeatListener(sid).catch(() => {});
	}

	const [status, adminGate] = await Promise.all([getRadioCachedStatus(), getBroadcastAdminState()]);

	let listeners = 0;
	try {
		listeners = await countActiveListeners();
	} catch {
		// DB unavailable — return 0
	}

	const icecastLive = status?.isLive ?? false;
	const isLive = icecastLive && adminGate.is_live;

	return json({
		isLive,
		checkedAt: status?.checkedAt ?? new Date().toISOString(),
		listeners,
		streamUrl: isLive ? (status?.streamUrl ?? getLiveAudioSourceUrl()) : undefined,
		title: adminGate.title,
		description: adminGate.description,
		thumbnailUrl: adminGate.thumbnail_url
	});
}
