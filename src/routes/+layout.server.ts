import { getLiveStatus } from '$lib/server/youtube-poller';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	const liveStatus = getLiveStatus();

	// Map the ephemeral status to something the layout expects (Partial<YoutubeVideo>)
	// OR update layout to just check isLive and url.
	// Looking at +layout.svelte, it checks data.liveStream and uses data.liveStream.webpage_url
	// So we need to return an object that has webpage_url if live.

	// Reverting debug force
	if (liveStatus && liveStatus.isLive && liveStatus.url) {
		return {
			liveStream: {
				webpage_url: liveStatus.url,
				title: liveStatus.title
			}
		};
	}

	return {
		liveStream: null
	};
};
