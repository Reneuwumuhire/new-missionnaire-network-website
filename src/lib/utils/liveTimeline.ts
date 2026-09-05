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
