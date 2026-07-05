import { json } from '@sveltejs/kit';
import { checkLiveAudio } from '$lib/server/icecast';

export async function GET({ fetch }) {
	const check = await checkLiveAudio(fetch);

	return json({
		isLive: check.isLive,
		sourceUrl: check.sourceUrl,
		upstreamStatus: check.status,
		error: check.error,
		checkedAt: new Date().toISOString()
	});
}
