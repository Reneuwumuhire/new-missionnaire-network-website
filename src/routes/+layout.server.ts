import { getLiveStatus } from '$lib/server/youtube-poller';
import { getLastStatus } from '$lib/server/radio-status-broker';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	const [liveStatus, radioStatus] = await Promise.all([
		getLiveStatus(),
		getLastStatus()
	]);

	const liveStream =
		liveStatus && liveStatus.isLive && liveStatus.url
			? { webpage_url: liveStatus.url, title: liveStatus.title }
			: null;

	return {
		liveStream,
		radioIsLive: radioStatus?.isLive ?? false
	};
};
