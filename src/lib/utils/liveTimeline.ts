/** The playable live edge trails the newest HLS segment. Use that same edge
 * for the scrubber, behind-time and jump-to-live, without changing the media
 * clock (which also drives transcripts). */
export function getLiveTimeline({
	start,
	end,
	position,
	syncPosition,
	playing,
	rewound = false
}: {
	start: number;
	end: number;
	position: number;
	syncPosition?: number | null;
	playing: boolean;
	rewound?: boolean;
}) {
	const edge = Math.max(
		start,
		Math.min(
			end,
			typeof syncPosition === 'number' && Number.isFinite(syncPosition) ? syncPosition : end - 18
		)
	);
	const behind = Math.max(0, edge - position);
	const atEdge = playing && behind < (rewound ? 1 : 7);
	const value = atEdge ? edge : Math.max(start, Math.min(edge, position));
	const fill = edge > start ? ((value - start) / (edge - start)) * 100 : 0;
	return { edge, behind, atEdge, value, fill };
}

export type LiveSubtitleTrack = {
	url: string;
	anchorEpochMs: number | null;
	offsetMs: number;
	pausedPositionMs?: number | null;
	timeline?: Array<{
		fromEpochMs: number;
		toEpochMs: number | null;
		url: string;
		anchorEpochMs: number;
		offsetMs: number;
		pausedPositionMs: number | null;
	}>;
};

/** Select the timing for the audio being heard, including rewinds across a pause or seek. */
export function liveSubtitlePosition(
	subtitles: LiveSubtitleTrack | null,
	playbackEpochMs: number | null,
	delayMs = 0
) {
	const position = playbackEpochMs === null ? null : playbackEpochMs - delayMs;
	const timeline = subtitles?.timeline ?? [];
	const segment =
		position === null
			? undefined
			: timeline.find(
					(item) =>
						position >= item.fromEpochMs && (item.toEpochMs === null || position < item.toEpochMs)
				);
	const track = position !== null && timeline.length ? segment : subtitles;
	const url = segment?.url ?? subtitles?.url ?? null;
	const anchor = track?.anchorEpochMs ?? null;
	if (!track || position === null || anchor === null) {
		return { url, anchored: anchor !== null, timeSec: null };
	}
	const elapsed = position - anchor + track.offsetMs;
	return {
		url,
		anchored: true,
		timeSec: Math.min(elapsed, track.pausedPositionMs ?? elapsed) / 1000
	};
}
