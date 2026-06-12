import { browser } from '$app/environment';
import type { YoutubeVideo } from '$lib/models/youtube';
import type { YouTubeCachedStatus } from '../../db/collections';
import { pageMeta, shareTitle, shareDescription } from '$lib/seo';

// Single og:*/twitter:* tag set rendered by the root layout. Deep links
// (/videos?v=<id>) get the video's real title/description/thumbnail so the
// WhatsApp/Facebook preview card shows the shared video, not the generic page.
function buildVideosMeta(requestedVideo: YoutubeVideo | null) {
	if (requestedVideo?.title && requestedVideo.id) {
		return pageMeta(`/videos?v=${encodeURIComponent(requestedVideo.id)}`, {
			title: shareTitle(requestedVideo.title),
			description: shareDescription(
				requestedVideo.description?.trim() ||
					`Regardez « ${requestedVideo.title} » sur Missionnaire Network.`
			),
			image: requestedVideo.thumbnail || undefined,
			type: 'video.other',
			// Share variant — the canonical listing is /videos.
			noindex: true
		});
	}
	return pageMeta('/videos', {
		title: 'Vidéos | Missionnaire Network',
		description:
			'Regardez les vidéos de prédications, retransmissions et enseignements du Message sur Missionnaire Network.'
	});
}

export const load = async ({ fetch, url }) => {
	const filter = url.searchParams.get('filter') || 'All';
	const search = url.searchParams.get('search') || '';
	const videoId = url.searchParams.get('v') || '';

	const baseShape = {
		filter,
		search,
		videoId
	};

	if (browser) {
		return {
			...baseShape,
			videos: [] as YoutubeVideo[],
			liveStatus: null as YouTubeCachedStatus | null,
			requestedVideo: null as YoutubeVideo | null,
			meta: buildVideosMeta(null),
			deferred: true
		};
	}

	const params = new URLSearchParams({ filter, search });
	if (videoId) params.set('v', videoId);

	const response = await fetch(`/api/videos-page?${params.toString()}`);
	if (!response.ok) {
		return {
			...baseShape,
			videos: [] as YoutubeVideo[],
			liveStatus: null as YouTubeCachedStatus | null,
			requestedVideo: null as YoutubeVideo | null,
			meta: buildVideosMeta(null),
			deferred: false
		};
	}

	const result = await response.json();
	const requestedVideo = (result.requestedVideo || null) as YoutubeVideo | null;

	return {
		...baseShape,
		videos: (result.data || []) as YoutubeVideo[],
		liveStatus: (result.liveStatus || null) as YouTubeCachedStatus | null,
		requestedVideo,
		meta: buildVideosMeta(requestedVideo),
		deferred: false
	};
};
