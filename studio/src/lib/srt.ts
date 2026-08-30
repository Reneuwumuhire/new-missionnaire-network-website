// SubRip parsing, kept byte-compatible with the admin panel's parser
// (admin/src/lib/utils/srt.ts) — the same files feed both, and the live
// transcript listeners see must line up with what the studio burns into video.

export interface SrtCue {
	startMs: number;
	endMs: number;
	text: string;
}

const TIMECODE_RE =
	/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

function toMs(h: string, m: string, s: string, ms: string): number {
	return Number(h) * 3_600_000 + Number(m) * 60_000 + Number(s) * 1000 + Number(ms.padEnd(3, '0'));
}

export function parseSrt(raw: string): SrtCue[] {
	const normalized = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
	const cues: SrtCue[] = [];

	for (const block of normalized.split(/\n{2,}/)) {
		const lines = block.split('\n');
		const tcIndex = lines.findIndex((line) => TIMECODE_RE.test(line));
		if (tcIndex === -1) continue;
		const match = lines[tcIndex].match(TIMECODE_RE);
		if (!match) continue;

		const text = lines
			.slice(tcIndex + 1)
			.map((line) => line.trim())
			.filter((line) => line.length > 0)
			.join('\n');
		if (!text) continue;

		cues.push({
			startMs: toMs(match[1], match[2], match[3], match[4]),
			endMs: toMs(match[5], match[6], match[7], match[8]),
			text
		});
	}

	cues.sort((a, b) => a.startMs - b.startMs);
	return cues;
}

/** Index of the cue active at `ms`, or the most recent one if `ms` falls in a
 *  gap — the line stays up rather than blinking off between sentences.
 *  -1 before the first cue. */
export function findCueIndex(cues: SrtCue[], ms: number): number {
	let lo = 0;
	let hi = cues.length - 1;
	let result = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (cues[mid].startMs <= ms) {
			result = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return result;
}

/** Split pasted lyrics into the lines the operator will tap through. A blank
 *  line separates stanzas; consecutive non-blank lines are one screen only if
 *  the operator asked for pairs, so keep it literal: one line per screen. */
export function parseLyricLines(raw: string): string[] {
	return raw
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

function fmtTimecode(ms: number): string {
	const clamped = Math.max(0, Math.round(ms));
	const h = Math.floor(clamped / 3_600_000);
	const m = Math.floor((clamped % 3_600_000) / 60_000);
	const s = Math.floor((clamped % 60_000) / 1000);
	const milli = clamped % 1000;
	const pad = (n: number, width = 2) => String(n).padStart(width, '0');
	return `${pad(h)}:${pad(m)}:${pad(s)},${pad(milli, 3)}`;
}

/** Turn tap-timed lines back into a .srt, so a manually-driven service can be
 *  saved and replayed (or attached to the recording afterwards). Lines the
 *  operator never reached are skipped. `endMs` defaults to the next line's
 *  start so the transcript has no holes. */
export function toSrt(entries: { text: string; startMs: number | null }[], tailMs = 4000): string {
	const timed = entries
		.filter((e): e is { text: string; startMs: number } => e.startMs !== null)
		.sort((a, b) => a.startMs - b.startMs);

	return timed
		.map((entry, i) => {
			const end = i + 1 < timed.length ? timed[i + 1].startMs : entry.startMs + tailMs;
			return `${i + 1}\n${fmtTimecode(entry.startMs)} --> ${fmtTimecode(end)}\n${entry.text}\n`;
		})
		.join('\n');
}
