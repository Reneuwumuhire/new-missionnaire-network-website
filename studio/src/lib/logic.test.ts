import { describe, expect, it } from 'vitest';
import { applyDrag, centeredRect, cursorForHandle, drawBox, hitHandle, toPixels } from './geom';
import { findCueIndex, parseLyricLines, parseSrt, toSrt } from './srt';

describe('drawBox', () => {
	const dst = { x: 0, y: 0, w: 1280, h: 720 };

	it('crops the source in cover mode instead of distorting it', () => {
		// 4:3 camera into a 16:9 frame: the top and bottom get cropped away.
		const box = drawBox(1440, 1080, dst, 'cover');
		expect(box.dw).toBe(1280);
		expect(box.dh).toBe(720);
		expect(box.sw).toBe(1440);
		expect(Math.round(box.sh)).toBe(810);
		expect(Math.round(box.sy)).toBe(135);
	});

	it('letterboxes in contain mode and stays centred', () => {
		const box = drawBox(1440, 1080, dst, 'contain');
		expect(box.dh).toBe(720);
		expect(box.dw).toBe(960);
		expect(box.dx).toBe(160);
		expect(box.sw).toBe(1440); // whole source, nothing cropped
	});

	it('fills the box exactly in stretch mode', () => {
		const box = drawBox(1440, 1080, dst, 'stretch');
		expect([box.dx, box.dy, box.dw, box.dh]).toEqual([0, 0, 1280, 720]);
	});

	it('survives a source that has not produced a frame yet', () => {
		expect(() => drawBox(0, 0, dst, 'cover')).not.toThrow();
		expect(drawBox(0, 0, dst, 'cover').dw).toBe(0);
	});
});

describe('layer manipulation', () => {
	const rect = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };

	it('finds corner handles before the body', () => {
		expect(hitHandle(rect, 0.25, 0.25)).toBe('nw');
		expect(hitHandle(rect, 0.75, 0.75)).toBe('se');
		expect(hitHandle(rect, 0.5, 0.5)).toBe('move');
		expect(hitHandle(rect, 0.05, 0.05)).toBeNull();
	});

	it('resizes from every edge as well as the corners', () => {
		expect(hitHandle(rect, 0.5, 0.25)).toBe('n');
		expect(hitHandle(rect, 0.75, 0.5)).toBe('e');
		expect(hitHandle(rect, 0.5, 0.75)).toBe('s');
		expect(hitHandle(rect, 0.25, 0.5)).toBe('w');
		expect(applyDrag(rect, 'e', 0.1, 0.2)).toEqual({ x: 0.25, y: 0.25, w: 0.6, h: 0.5 });
		expect(applyDrag(rect, 'n', 0.2, 0.1)).toEqual({ x: 0.25, y: 0.35, w: 0.5, h: 0.4 });
	});

	it('keeps a draggable body on layers thinner than the resize handles', () => {
		expect(hitHandle({ x: 0.25, y: 0.25, w: 0.03, h: 0.03 }, 0.265, 0.265)).toBe('move');
	});

	it('moves without resizing', () => {
		const moved = applyDrag(rect, 'move', 0.1, -0.05);
		expect(moved).toEqual({ x: 0.35, y: 0.2, w: 0.5, h: 0.5 });
	});

	it('keeps the opposite corner pinned while resizing', () => {
		const resized = applyDrag(rect, 'nw', 0.1, 0.1);
		expect(resized.x).toBeCloseTo(0.35);
		expect(resized.x + resized.w).toBeCloseTo(0.75);
		expect(resized.y + resized.h).toBeCloseTo(0.75);
	});

	it('refuses to invert a layer dragged past its opposite edge', () => {
		const collapsed = applyDrag(rect, 'nw', 5, 5);
		expect(collapsed.w).toBeGreaterThan(0);
		expect(collapsed.h).toBeGreaterThan(0);
		expect(collapsed.x + collapsed.w).toBeCloseTo(0.75);
	});

	it('allows a layer to be pushed partly off-frame', () => {
		// A half-off logo is a legitimate look, not an error to clamp away.
		expect(applyDrag(rect, 'move', -0.5, 0).x).toBeCloseTo(-0.25);
	});

	it('shows a resize cursor on the corners and a hand on the body', () => {
		// Opposite corners share a diagonal, so they share a cursor — getting
		// this pairing backwards points the arrow the wrong way.
		expect(cursorForHandle('nw')).toBe('nwse-resize');
		expect(cursorForHandle('se')).toBe('nwse-resize');
		expect(cursorForHandle('ne')).toBe('nesw-resize');
		expect(cursorForHandle('sw')).toBe('nesw-resize');
		expect(cursorForHandle('move')).toBe('grab');
		expect(cursorForHandle('n')).toBe('ns-resize');
		expect(cursorForHandle('e')).toBe('ew-resize');
		expect(cursorForHandle('move', true)).toBe('grabbing');
		expect(cursorForHandle(null)).toBe('default');
		// Resizing looks the same whether or not the button is down.
		expect(cursorForHandle('se', true)).toBe('nwse-resize');
	});

	it('centres a new source at the frame aspect', () => {
		const r = centeredRect(16 / 9, 16 / 9, 0.5);
		expect(r.w).toBeCloseTo(0.5);
		expect(r.h).toBeCloseTo(0.5);
		expect(r.x).toBeCloseTo(0.25);
	});

	it('scales normalised rects to the canvas', () => {
		expect(toPixels({ x: 0.5, y: 0, w: 0.5, h: 1 }, 1920, 1080)).toEqual({
			x: 960,
			y: 0,
			w: 960,
			h: 1080
		});
	});
});

describe('srt', () => {
	const SAMPLE = `1
00:00:01,000 --> 00:00:03,500
Béni soit le Seigneur

2
00:00:03,500 --> 00:00:06,000
Il est digne de louange
`;

	it('parses timings and multi-line cues', () => {
		const cues = parseSrt(SAMPLE);
		expect(cues).toHaveLength(2);
		expect(cues[0].startMs).toBe(1000);
		expect(cues[0].endMs).toBe(3500);
		expect(cues[1].text).toBe('Il est digne de louange');
	});

	it('tolerates CRLF, a BOM and a dot before the milliseconds', () => {
		const messy = '﻿1\r\n00:00:02.250 --> 00:00:04.000\r\nLigne\r\n';
		expect(parseSrt(messy)[0].startMs).toBe(2250);
	});

	it('holds the last cue through a gap rather than blinking off', () => {
		const cues = parseSrt(SAMPLE);
		expect(findCueIndex(cues, 0)).toBe(-1);
		expect(findCueIndex(cues, 2000)).toBe(0);
		expect(findCueIndex(cues, 99_000)).toBe(1);
	});

	it('splits pasted lyrics into one line per screen, ignoring blanks', () => {
		expect(parseLyricLines('  Ligne A \n\n\n Ligne B \n')).toEqual(['Ligne A', 'Ligne B']);
	});

	it('round-trips tapped timings back into a playable srt', () => {
		const srt = toSrt([
			{ text: 'Première', startMs: 0 },
			{ text: 'Jamais atteinte', startMs: null },
			{ text: 'Deuxième', startMs: 5000 }
		]);
		const cues = parseSrt(srt);
		expect(cues.map((c) => c.text)).toEqual(['Première', 'Deuxième']);
		// No hole between lines: each cue runs until the next one starts.
		expect(cues[0].endMs).toBe(cues[1].startMs);
		expect(cues[1].endMs).toBe(9000);
	});
});
