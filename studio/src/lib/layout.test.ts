import { describe, expect, it } from 'vitest';
import { MIN_WEIGHT, clamp, popoverFit, splitWeights } from './layout';

describe('dock resizing', () => {
	// 4 weight units across 400px = 100px per unit.
	const PX_PER_WEIGHT = 100;

	it('moves width from one neighbour to the other', () => {
		const [a, b] = splitWeights(2, 2, 50, PX_PER_WEIGHT);
		expect(a).toBeCloseTo(2.5);
		expect(b).toBeCloseTo(1.5);
	});

	it('keeps the pair total constant so the rest of the row never shifts', () => {
		for (const delta of [-500, -37, 0, 12, 900]) {
			const [a, b] = splitWeights(1.4, 2.6, delta, PX_PER_WEIGHT);
			expect(a + b).toBeCloseTo(4);
		}
	});

	it('refuses to collapse a dock to nothing', () => {
		// Dragging far past the edge: the shrinking dock stops at the minimum,
		// otherwise its splitter would have no width left to grab it back.
		const [a, b] = splitWeights(2, 2, 100_000, PX_PER_WEIGHT);
		expect(b).toBe(MIN_WEIGHT);
		expect(a).toBeCloseTo(4 - MIN_WEIGHT);

		const [c, d] = splitWeights(2, 2, -100_000, PX_PER_WEIGHT);
		expect(c).toBe(MIN_WEIGHT);
		expect(d).toBeCloseTo(4 - MIN_WEIGHT);
	});

	it('splits evenly when there is not enough room for two minimums', () => {
		const [a, b] = splitWeights(0.2, 0.2, 500, PX_PER_WEIGHT);
		expect(a).toBeCloseTo(0.2);
		expect(b).toBeCloseTo(0.2);
	});

	it('ignores a drag before the row has been measured', () => {
		// clientWidth is 0 on the first frame; dividing by it would produce
		// Infinity and blow every dock away.
		expect(splitWeights(1, 2, 40, 0)).toEqual([1, 2]);
		expect(splitWeights(1, 2, 40, Number.POSITIVE_INFINITY)).toEqual([1, 2]);
	});
});

describe('clamp', () => {
	it('holds panel sizes inside their limits', () => {
		expect(clamp(50, 120, 600)).toBe(120);
		expect(clamp(900, 120, 600)).toBe(600);
		expect(clamp(300, 120, 600)).toBe(300);
	});
});

describe('popover fitting', () => {
	it('opens upward when the button sits low, as it does in the dock footer', () => {
		const fit = popoverFit(880, 900, 1000);
		expect(fit.direction).toBe('up');
		expect(fit.maxHeight).toBe(868);
	});

	it('opens downward when there is more room below', () => {
		const fit = popoverFit(100, 120, 1000);
		expect(fit.direction).toBe('down');
		expect(fit.maxHeight).toBe(868);
	});

	it('never reports a height too small to show anything', () => {
		// Squeezed against the top of the window: still tall enough to scroll in.
		expect(popoverFit(4, 24, 1000).maxHeight).toBeGreaterThanOrEqual(96);
		expect(popoverFit(4, 8, 20).maxHeight).toBeGreaterThanOrEqual(96);
	});
});
