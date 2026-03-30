import { json } from '@sveltejs/kit';
import { probeLiveAudio } from '$lib/server/live-audio';

export async function GET({ fetch }) {
	const probe = await probeLiveAudio(fetch);

	return json({
		isLive: probe.isLive,
		sourceUrl: probe.sourceUrl,
		upstreamStatus: probe.status,
		error: probe.error,
		checkedAt: new Date().toISOString()
	});
}
