// SubRip (.srt) parsing for the live-transcript feature. Files are produced by
// external transcription tools, so the parser tolerates the variations seen in
// the wild: BOM, CRLF/CR line endings, leading spaces in cue text, multi-line
// cues, a missing or garbled counter line, and `.` instead of `,` before the
// milliseconds.

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
	const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
	const cues: SrtCue[] = [];

	for (const block of normalized.split(/\n{2,}/)) {
		const lines = block.split('\n');
		// The timecode line is usually line 2 (after the counter) but may be
		// line 1 when the counter is missing.
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

/** Index of the cue active at `ms`, or the most recent cue if `ms` falls in a
 *  gap between cues (the transcript keeps the last sentence highlighted rather
 *  than blinking off). Returns -1 before the first cue. Binary search. */
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
