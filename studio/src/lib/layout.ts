// Panel sizing. Docks are laid out by weight rather than pixels so the row
// still fills the window at any size; a splitter drag moves weight from one
// neighbour to the other, which is why nothing else on the row shifts.

export type DockId = 'scenes' | 'sources' | 'mixer' | 'transition' | 'controls';

export interface Layout {
	/** Height of the bottom dock row, px. */
	dockHeight: number;
	/** Width of the lyrics column, px. */
	lyricsWidth: number;
	weights: Record<DockId, number>;
}

export const DEFAULT_LAYOUT: Layout = {
	dockHeight: 240,
	lyricsWidth: 368,
	weights: { scenes: 1, sources: 1.3, mixer: 2.4, transition: 0.85, controls: 1.05 }
};

/** A dock narrower than this is unusable, and one dragged to zero can never be
 *  dragged back — the handle would have no width to grab. */
export const MIN_WEIGHT = 0.35;

export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

/** Move `deltaPx` from the right neighbour to the left one. Their combined
 *  weight is preserved, so the rest of the row does not move. */
export function splitWeights(
	left: number,
	right: number,
	deltaPx: number,
	pxPerWeight: number
): [number, number] {
	const total = left + right;
	if (total <= MIN_WEIGHT * 2) return [total / 2, total / 2];
	if (!Number.isFinite(pxPerWeight) || pxPerWeight <= 0) return [left, right];

	const delta = deltaPx / pxPerWeight;
	let a = left + delta;
	let b = right - delta;
	if (a < MIN_WEIGHT) {
		a = MIN_WEIGHT;
		b = total - MIN_WEIGHT;
	} else if (b < MIN_WEIGHT) {
		b = MIN_WEIGHT;
		a = total - MIN_WEIGHT;
	}
	return [a, b];
}

/** Room for a popover that opens upward from `anchorTop`, and downward from
 *  `anchorBottom`. Returns the direction with more room and how tall it may be,
 *  so a menu never runs off the window however the panels are sized. */
export function popoverFit(
	anchorTop: number,
	anchorBottom: number,
	viewportHeight: number,
	margin = 12
): { direction: 'up' | 'down'; maxHeight: number } {
	const above = anchorTop - margin;
	const below = viewportHeight - anchorBottom - margin;
	return above >= below
		? { direction: 'up', maxHeight: Math.max(96, above) }
		: { direction: 'down', maxHeight: Math.max(96, below) };
}
