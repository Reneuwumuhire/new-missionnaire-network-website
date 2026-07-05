/** Pseudo-track that lets the live radio broadcast play through the global
 *  audio player (the same one used for music/sermons) instead of a separate
 *  page-embedded player. The `isLiveStream` marker switches the player into
 *  broadcast mode: no seeking (Icecast reports Infinity duration), reconnect
 *  at the live edge instead of next-track on ended/error, and no
 *  download/favorite/resume-snapshot affordances. */

export const LIVE_TRACK_ID = 'live-radio-stream';

export interface LiveStreamTrack {
	_id: typeof LIVE_TRACK_ID;
	isLiveStream: true;
	title: string;
	/** Direct stream URL (no cache-buster — the player adds one per connect). */
	url: string;
	/** HLS DVR playlist. When set the player plays this instead of `url`,
	 *  gaining server-side pause/resume + seek-back + jump-to-live; `url`
	 *  (Icecast) remains the fallback if HLS can't start. */
	hlsUrl: string | null;
	thumbnail_url: string | null;
}

export function createLiveStreamTrack(params: {
	title: string;
	url: string;
	hlsUrl?: string | null;
	thumbnailUrl?: string | null;
}): LiveStreamTrack {
	return {
		_id: LIVE_TRACK_ID,
		isLiveStream: true,
		title: params.title,
		url: params.url,
		hlsUrl: params.hlsUrl ?? null,
		thumbnail_url: params.thumbnailUrl ?? null
	};
}

export function isLiveStreamTrack(item: unknown): item is LiveStreamTrack {
	return (
		!!item && typeof item === 'object' && (item as { isLiveStream?: unknown }).isLiveStream === true
	);
}
