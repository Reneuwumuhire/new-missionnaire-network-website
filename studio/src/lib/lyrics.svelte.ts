// Lyrics / live transcript. Two ways to run a service:
//
//  • timed  — a .srt with real timings. The operator anchors it once ("this
//    line is being sung now") and it advances itself. Same anchor+offset model
//    the admin panel already uses, so listeners on the audio-only app see the
//    exact same line as viewers on YouTube.
//  • manual — pasted lyrics with no timings. The operator taps through. Taps
//    are timestamped, so the service can be exported as a .srt afterwards.

import { handleFor } from './media.svelte';
import { findCueIndex, parseLyricLines, parseSrt, toSrt, type SrtCue } from './srt';

export type LyricsMode = 'timed' | 'manual';

export const lyrics = $state({
	mode: 'timed' as LyricsMode,
	fileName: '',
	/** timed mode */
	cues: [] as SrtCue[],
	anchorEpochMs: null as number | null,
	offsetMs: 0,
	/** manual mode */
	lines: [] as string[],
	taps: [] as (number | null)[],
	index: -1,
	startedAtEpochMs: null as number | null,
	/** Master on-air switch for every lyrics layer, so the operator can clear
	 *  the screen instantly without hunting for the layer. */
	onAir: true,
	/** A media source whose own clock drives the transcript. A recording made
	 *  earlier carries its own timeline: pause it and the lyrics stop with it,
	 *  wind it back and they follow. A wall clock cannot do either. */
	followLayerId: null as string | null
});

export function loadSrt(text: string, fileName: string): number {
	const cues = parseSrt(text);
	lyrics.mode = 'timed';
	lyrics.cues = cues;
	lyrics.fileName = fileName;
	lyrics.anchorEpochMs = null;
	lyrics.offsetMs = 0;
	return cues.length;
}

export function loadLines(text: string, fileName = ''): number {
	const lines = parseLyricLines(text);
	lyrics.mode = 'manual';
	lyrics.lines = lines;
	lyrics.taps = lines.map(() => null);
	lyrics.index = -1;
	lyrics.fileName = fileName;
	lyrics.startedAtEpochMs = null;
	return lines.length;
}

/** Anchor the timed transcript: "SRT position `cueStartMs` is playing right
 *  now". Passing 0 means the file starts now. */
export function anchorAt(cueStartMs: number, atEpochMs = Date.now()) {
	lyrics.anchorEpochMs = atEpochMs - cueStartMs;
	lyrics.offsetMs = 0;
}

export function nudge(deltaMs: number) {
	if (lyrics.anchorEpochMs === null) return;
	lyrics.offsetMs = Math.max(-1_800_000, Math.min(1_800_000, lyrics.offsetMs + deltaMs));
}

export function clearSync() {
	lyrics.followLayerId = null;
	lyrics.anchorEpochMs = null;
	lyrics.offsetMs = 0;
	lyrics.index = -1;
}

export function step(delta: number, atEpochMs = Date.now()) {
	if (lyrics.mode !== 'manual' || lyrics.lines.length === 0) return;
	const next = Math.max(-1, Math.min(lyrics.lines.length - 1, lyrics.index + delta));
	goTo(next, atEpochMs);
}

export function goTo(index: number, atEpochMs = Date.now()) {
	if (lyrics.mode !== 'manual') return;
	lyrics.index = index;
	if (index < 0) return;
	if (lyrics.startedAtEpochMs === null) lyrics.startedAtEpochMs = atEpochMs;
	lyrics.taps[index] = atEpochMs - lyrics.startedAtEpochMs;
}

/** Follow a media source's own clock, or nothing. */
export function followMedia(layerId: string | null) {
	lyrics.followLayerId = layerId;
	lyrics.offsetMs = 0;
}

/** Where the followed recording has got to, as an SRT position. Pure, so the
 *  arithmetic can be checked without a media element. */
export function positionFromMedia(currentTimeSec: number, offsetMs: number): number {
	return Math.round(currentTimeSec * 1000) + offsetMs;
}

/** SRT position, in ms, of the line that should be showing now. */
export function timedPositionMs(nowMs = Date.now()): number | null {
	if (lyrics.followLayerId) {
		const el = handleFor(lyrics.followLayerId)?.el;
		// A source that has gone away leaves the transcript where it was rather
		// than snapping to zero and flashing the first line on air.
		if (el instanceof HTMLVideoElement) return positionFromMedia(el.currentTime, lyrics.offsetMs);
		return null;
	}
	if (lyrics.anchorEpochMs === null) return null;
	return nowMs - lyrics.anchorEpochMs + lyrics.offsetMs;
}

export interface OnAirLines {
	current: string;
	next: string;
	/** Index into cues/lines, -1 when nothing is showing yet. */
	index: number;
}

export function onAirLines(nowMs = Date.now()): OnAirLines {
	if (!lyrics.onAir) return { current: '', next: '', index: -1 };
	if (lyrics.mode === 'timed') {
		const pos = timedPositionMs(nowMs);
		if (pos === null) return { current: '', next: '', index: -1 };
		const i = findCueIndex(lyrics.cues, pos);
		// Past the end of the file: hold nothing rather than the last line
		// forever — a finished transcript should leave the screen clean.
		const cue = i >= 0 ? lyrics.cues[i] : null;
		const expired = cue ? pos > cue.endMs + 5000 : false;
		return {
			current: cue && !expired ? cue.text : '',
			next: lyrics.cues[i + 1]?.text ?? '',
			index: i
		};
	}
	return {
		current: lyrics.lines[lyrics.index] ?? '',
		next: lyrics.lines[lyrics.index + 1] ?? '',
		index: lyrics.index
	};
}

/** The manual run, as a .srt — so a service driven by hand can still be
 *  attached to the recording afterwards. */
export function exportManualSrt(): string {
	return toSrt(lyrics.lines.map((text, i) => ({ text, startMs: lyrics.taps[i] ?? null })));
}
