import { beforeEach, describe, expect, it } from 'vitest';
import {
	anchorAt,
	clearSync,
	exportManualSrt,
	goTo,
	loadLines,
	loadSrt,
	lyrics,
	nudge,
	onAirLines,
	step,
	timedPositionMs
} from './lyrics.svelte';
import { parseSrt } from './srt';

const SRT = `1
00:00:10,000 --> 00:00:14,000
Ligne une

2
00:00:14,000 --> 00:00:18,000
Ligne deux
`;

beforeEach(() => {
	clearSync();
	lyrics.onAir = true;
	lyrics.cues = [];
	lyrics.lines = [];
	lyrics.taps = [];
	lyrics.mode = 'timed';
});

describe('timed transcript', () => {
	it('shows nothing until it is anchored', () => {
		loadSrt(SRT, 'test.srt');
		expect(lyrics.cues).toHaveLength(2);
		expect(timedPositionMs(Date.now())).toBeNull();
		expect(onAirLines(Date.now()).current).toBe('');
	});

	it('anchoring a cue puts that cue on air immediately', () => {
		loadSrt(SRT, 'test.srt');
		const t = 1_000_000;
		// "Ligne deux is being sung right now."
		anchorAt(14_000, t);
		expect(onAirLines(t).current).toBe('Ligne deux');
		expect(onAirLines(t).next).toBe('');
		// Four seconds earlier the file was on the previous line.
		expect(onAirLines(t - 4000).current).toBe('Ligne une');
	});

	it('nudging shifts the transcript against the audio', () => {
		loadSrt(SRT, 'test.srt');
		const t = 1_000_000;
		anchorAt(10_000, t);
		expect(onAirLines(t).current).toBe('Ligne une');
		// Text is running behind: push it 4s ahead.
		nudge(4000);
		expect(onAirLines(t).current).toBe('Ligne deux');
	});

	it('clears the screen once the file has run out', () => {
		loadSrt(SRT, 'test.srt');
		const t = 1_000_000;
		anchorAt(0, t);
		// Well past the last cue's end: hold nothing rather than the last line
		// staying up for the rest of the service.
		expect(onAirLines(t + 60_000).current).toBe('');
	});

	it('the master switch blanks every lyrics layer at once', () => {
		loadSrt(SRT, 'test.srt');
		const t = 1_000_000;
		anchorAt(10_000, t);
		lyrics.onAir = false;
		expect(onAirLines(t).current).toBe('');
	});
});

describe('manual run', () => {
	it('steps forward and back, and shows the upcoming line', () => {
		loadLines('Un\nDeux\nTrois');
		expect(onAirLines().current).toBe('');
		step(1, 1000);
		expect(onAirLines().current).toBe('Un');
		expect(onAirLines().next).toBe('Deux');
		step(1, 2000);
		expect(onAirLines().current).toBe('Deux');
		step(-1, 3000);
		expect(onAirLines().current).toBe('Un');
	});

	it('does not run off either end of the sheet', () => {
		loadLines('Un\nDeux');
		step(-1, 1000);
		expect(lyrics.index).toBe(-1);
		step(1, 1100);
		step(1, 1200);
		step(1, 1300);
		expect(lyrics.index).toBe(1);
	});

	it('times taps from the first one, and exports a usable srt', () => {
		loadLines('Un\nDeux\nTrois');
		goTo(0, 5000); // clock starts here, not at load
		goTo(1, 9000);
		goTo(2, 12_000);
		const cues = parseSrt(exportManualSrt());
		expect(cues.map((c) => c.text)).toEqual(['Un', 'Deux', 'Trois']);
		expect(cues[0].startMs).toBe(0);
		expect(cues[1].startMs).toBe(4000);
		expect(cues[2].startMs).toBe(7000);
	});

	it('skips lines that were never reached when exporting', () => {
		loadLines('Un\nDeux\nTrois');
		goTo(0, 1000);
		goTo(2, 4000);
		expect(parseSrt(exportManualSrt()).map((c) => c.text)).toEqual(['Un', 'Trois']);
	});
});
