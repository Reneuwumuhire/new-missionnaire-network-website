import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseSrt, findCueIndex } from './srt';

const sample = readFileSync(
	fileURLToPath(new URL('./__tests__/fixtures/sample-fr.srt', import.meta.url)),
	'utf-8'
);

describe('parseSrt', () => {
	it('parses a simple two-cue file', () => {
		const cues = parseSrt(
			'1\n00:00:00,000 --> 00:00:15,940\nHello world\n\n2\n00:00:15,940 --> 00:00:40,880\nSecond cue\n'
		);
		expect(cues).toEqual([
			{ startMs: 0, endMs: 15940, text: 'Hello world' },
			{ startMs: 15940, endMs: 40880, text: 'Second cue' }
		]);
	});

	it('strips BOM and handles CRLF line endings', () => {
		const cues = parseSrt('﻿1\r\n00:00:01,500 --> 00:00:02,000\r\nText\r\n');
		expect(cues).toEqual([{ startMs: 1500, endMs: 2000, text: 'Text' }]);
	});

	it('handles CR-only line endings', () => {
		const cues = parseSrt('1\r00:00:01,000 --> 00:00:02,000\rText\r\r2\r00:00:03,000 --> 00:00:04,000\rMore\r');
		expect(cues).toHaveLength(2);
		expect(cues[1].text).toBe('More');
	});

	it('trims leading spaces in cue text', () => {
		const cues = parseSrt('1\n00:00:00,000 --> 00:00:01,000\n Rendons grâce au Seigneur\n');
		expect(cues[0].text).toBe('Rendons grâce au Seigneur');
	});

	it('joins multi-line cues with newlines', () => {
		const cues = parseSrt('1\n00:00:00,000 --> 00:00:01,000\nline one\nline two\n');
		expect(cues[0].text).toBe('line one\nline two');
	});

	it('tolerates a missing counter line', () => {
		const cues = parseSrt('00:00:05,000 --> 00:00:06,000\nNo counter\n');
		expect(cues).toEqual([{ startMs: 5000, endMs: 6000, text: 'No counter' }]);
	});

	it('accepts a dot as millisecond separator', () => {
		const cues = parseSrt('1\n00:01:02.345 --> 00:01:03.456\nDotted\n');
		expect(cues[0].startMs).toBe(62345);
		expect(cues[0].endMs).toBe(63456);
	});

	it('pads short millisecond fields', () => {
		const cues = parseSrt('1\n00:00:01,5 --> 00:00:02,25\nShort ms\n');
		expect(cues[0].startMs).toBe(1500);
		expect(cues[0].endMs).toBe(2250);
	});

	it('drops blocks with no text and sorts by start time', () => {
		const cues = parseSrt(
			'1\n00:00:10,000 --> 00:00:11,000\nLater\n\n2\n00:00:09,000 --> 00:00:09,500\n\n\n3\n00:00:01,000 --> 00:00:02,000\nEarlier\n'
		);
		expect(cues.map((c) => c.text)).toEqual(['Earlier', 'Later']);
	});

	it('returns [] for garbage input', () => {
		expect(parseSrt('')).toEqual([]);
		expect(parseSrt('not an srt file\nat all')).toEqual([]);
	});

	it('parses the real French sample file (287 cues over ~1h20)', () => {
		const cues = parseSrt(sample);
		expect(cues).toHaveLength(287);
		expect(cues[0].startMs).toBe(0);
		expect(cues[0].text).toMatch(/^Rendons grâce au Seigneur/);
		expect(cues[286].startMs).toBe(79 * 60_000 + 55_560);
		expect(cues[286].endMs).toBe(80 * 60_000 + 14_560);
		expect(cues[286].text).toMatch(/je viens, je viens\.$/);
		// monotonic non-decreasing starts
		for (let i = 1; i < cues.length; i++) {
			expect(cues[i].startMs).toBeGreaterThanOrEqual(cues[i - 1].startMs);
		}
	});
});

describe('findCueIndex', () => {
	const cues = parseSrt(
		'1\n00:00:10,000 --> 00:00:12,000\nA\n\n2\n00:00:15,000 --> 00:00:18,000\nB\n\n3\n00:00:20,000 --> 00:00:25,000\nC\n'
	);

	it('returns -1 before the first cue', () => {
		expect(findCueIndex(cues, 0)).toBe(-1);
		expect(findCueIndex(cues, 9999)).toBe(-1);
	});

	it('finds the cue containing the timestamp', () => {
		expect(findCueIndex(cues, 10_000)).toBe(0);
		expect(findCueIndex(cues, 11_500)).toBe(0);
		expect(findCueIndex(cues, 16_000)).toBe(1);
	});

	it('keeps the previous cue inside a gap', () => {
		expect(findCueIndex(cues, 13_000)).toBe(0);
		expect(findCueIndex(cues, 19_000)).toBe(1);
	});

	it('returns the last cue after the end', () => {
		expect(findCueIndex(cues, 60_000)).toBe(2);
	});

	it('handles an empty cue list', () => {
		expect(findCueIndex([], 1000)).toBe(-1);
	});
});
