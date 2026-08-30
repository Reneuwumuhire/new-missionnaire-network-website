import { describe, expect, it } from 'vitest';
import { shouldShowBars } from './bars';

describe('when colour bars stand in', () => {
	it('covers a scene whose only camera is not producing', () => {
		// The case they exist for: camera unplugged, background still painting,
		// so the frame looks deliberate when it is actually broken.
		expect(shouldShowBars(1, 0, true, true)).toBe(true);
	});

	it('stays out of the way once any source produces a picture', () => {
		expect(shouldShowBars(1, 1, true, true)).toBe(false);
		expect(shouldShowBars(2, 1, true, true)).toBe(false);
	});

	it('leaves a deliberate slate alone', () => {
		// Colour + text and no media at all — a "back shortly" card, not a fault.
		expect(shouldShowBars(0, 0, true, true)).toBe(false);
	});

	it('covers a scene that draws nothing whatsoever', () => {
		expect(shouldShowBars(0, 0, false, true)).toBe(true);
	});

	it('is a preference, and off means off even with nothing on screen', () => {
		expect(shouldShowBars(1, 0, true, false)).toBe(false);
		expect(shouldShowBars(0, 0, false, false)).toBe(false);
	});
});
