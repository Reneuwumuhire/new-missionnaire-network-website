export type ExtractedSourceLine = {
	role?: string;
	text?: string;
	verse_number?: number | null;
};

export type ExtractedSection = {
	label?: string;
	lines?: Array<ExtractedSourceLine | string>;
	title?: string;
};

// indirimbo-zikundwa.bi marks a repeated passage with ":/: … :/:". The colons
// are not sentence punctuation and must never trigger a line break.
const REPEAT_MARK = ':/:';
// A control character the lyrics can never contain, and — unlike a space — one
// that counts as neither whitespace nor punctuation while we scan.
const REPEAT_PLACEHOLDER = String.fromCharCode(1);
const BREAKING_PUNCTUATION = /[.!?;:,]/;
const OPENING_MARK = /["'“”«»‘’(]/;
const UPPERCASE = /\p{Lu}/u;

// True when what follows a punctuation mark looks like the start of a new
// lyric line: an uppercase word, a quoted uppercase word, or a repeat mark.
function startsNewLine(rest: string) {
	let index = 0;
	while (index < rest.length && /\s/.test(rest[index])) index += 1;
	if (rest[index] === REPEAT_PLACEHOLDER) return true;
	while (index < rest.length && OPENING_MARK.test(rest[index])) index += 1;
	return UPPERCASE.test(rest[index] ?? '');
}

/**
 * Split a stanza into the lines a singer would read.
 *
 * The hymn pages carry no line breaks at all — a whole verse is one run of
 * `<span>`s with no `<br>` between them, and the spans are word-level export
 * noise, not structure. The only signal left is a punctuation mark followed by
 * a capitalised word, which is how hymn lines begin. That under-splits lines
 * ending without punctuation and never splits mid-line, which is the safe way
 * round: this only ever fills the admin textarea, where an editor reads it and
 * fixes it before anything is published.
 */
export function splitLyricLine(text: string): string[] {
	const guarded = text.split(REPEAT_MARK).join(REPEAT_PLACEHOLDER);
	const parts: string[] = [];
	let buffer = '';

	for (let index = 0; index < guarded.length; index += 1) {
		buffer += guarded[index];
		if (!BREAKING_PUNCTUATION.test(guarded[index])) continue;

		const next = guarded[index + 1] ?? '';
		// Keep punctuation runs together ("...", "?!") and only break when
		// whitespace follows — "3,50" or "St. Jean" stay in one piece.
		if (BREAKING_PUNCTUATION.test(next) || !/\s/.test(next)) continue;
		if (!startsNewLine(guarded.slice(index + 1))) continue;

		parts.push(buffer);
		buffer = '';
	}

	parts.push(buffer);

	return parts
		.map((part) => part.split(REPEAT_PLACEHOLDER).join(REPEAT_MARK).trim())
		.filter(Boolean);
}

function sourceLineText(sourceLine: ExtractedSourceLine | string) {
	return (typeof sourceLine === 'string' ? sourceLine : (sourceLine.text ?? '')).trim();
}

function sourceLineRole(sourceLine: ExtractedSourceLine | string) {
	return typeof sourceLine === 'string' ? '' : (sourceLine.role ?? '');
}

function sourceLineVerseNumber(sourceLine: ExtractedSourceLine | string) {
	if (typeof sourceLine === 'string') return null;
	const verseNumber = Number(sourceLine.verse_number);
	return Number.isFinite(verseNumber) && verseNumber > 0 ? verseNumber : null;
}

/**
 * Turn extracted sections into editor text: one paragraph per stanza, one line
 * per lyric line, "Refrain" on its own line above a chorus. Publishing that
 * text back records the paragraphs, so the admin and the player both show it
 * the way it was laid out here.
 */
export function formatExtractedLyrics(
	sections: ExtractedSection[] | undefined,
	lines: string[] | undefined
) {
	if (!sections || sections.length === 0) {
		return (lines ?? []).filter(Boolean).join('\n\n');
	}

	const blocks: string[][] = [];
	let inRefrain = false;

	for (const section of sections) {
		for (const sourceLine of section.lines ?? []) {
			const text = sourceLineText(sourceLine);
			if (!text) continue;

			const parts = splitLyricLine(text);
			if (parts.length === 0) continue;

			const verseNumber = sourceLineVerseNumber(sourceLine);
			if (verseNumber !== null) {
				parts[0] = `${verseNumber}. ${parts[0]}`;
			}

			// Consecutive chorus stanzas belong to one "Refrain" paragraph.
			if (sourceLineRole(sourceLine) === 'refrain') {
				if (!inRefrain) {
					blocks.push(['Refrain']);
					inRefrain = true;
				}
				blocks[blocks.length - 1].push(...parts);
				continue;
			}

			blocks.push(parts);
			inRefrain = false;
		}
	}

	return blocks.map((block) => block.join('\n')).join('\n\n');
}
