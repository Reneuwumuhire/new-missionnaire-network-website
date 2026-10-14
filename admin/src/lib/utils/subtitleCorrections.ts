/** Corrections for French live subtitles. Timings and cue numbers are never changed. */

export type SubtitleChange = { from: string; to: string; source: 'common' | 'pdf' };

const WORD_RE = /[\p{L}\p{N}]+/gu;
const ANCHOR_WORDS = 4;
const REFERENCE_TERMS = new Set([
	'jesus',
	'christ',
	'dieu',
	'branham',
	'ewald',
	'frank',
	'russ',
	'krefeld',
	'matthieu',
	'abraham',
	'hebreux',
	'gorbatchev',
	'schmidt',
	'barth',
	'bethanie',
	'zaire',
	'yahshua',
	'dessein',
	'pentecotistes',
	'prescience'
]);

type Token = { value: string; normalized: string; start: number; end: number; block: number };
type Replacement = { block: number; start: number; end: number; from: string; to: string };

function normalize(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase();
}

function distance(a: string, b: string): number {
	const prior = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		let diagonal = prior[0];
		prior[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const above = prior[j];
			prior[j] = Math.min(
				prior[j] + 1,
				prior[j - 1] + 1,
				diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
			);
			diagonal = above;
		}
	}
	return prior[b.length];
}

function tokens(value: string, block = 0): Token[] {
	return [...value.matchAll(WORD_RE)].map((match) => ({
		value: match[0],
		normalized: normalize(match[0]),
		start: match.index,
		end: match.index + match[0].length,
		block
	}));
}

function splitSrt(raw: string): { prefix: string; body: string; suffix: string }[] {
	const blocks: { prefix: string; body: string; suffix: string }[] = [];
	const re = /(?:^|\n{2,})([^]*?)(?=\n{2,}|$)/g;
	for (const match of raw.matchAll(re)) {
		const whole = match[0];
		const separatorLength = whole.length - whole.trimStart().length;
		const content = whole.slice(separatorLength);
		const line = content.match(/(?:^|\n)[^\n]*-->[^\n]*(?:\n|$)/);
		if (!line || line.index === undefined) {
			blocks.push({ prefix: whole, body: '', suffix: '' });
			continue;
		}
		const bodyStart = separatorLength + line.index + line[0].length;
		blocks.push({ prefix: whole.slice(0, bodyStart), body: whole.slice(bodyStart), suffix: '' });
	}
	return blocks;
}

function applyCommon(body: string, changes: SubtitleChange[]): string {
	const apply = (
		pattern: RegExp,
		replacement: string,
		predicate?: (match: RegExpExecArray, text: string) => boolean
	) => {
		body = body.replace(pattern, (...args) => {
			const found = args[0] as string;
			const offset = args.at(-2) as number;
			const original = args.at(-1) as string;
			const match = Object.assign([found], { index: offset }) as RegExpExecArray;
			if (predicate && !predicate(match, original)) return found;
			if (found !== replacement) changes.push({ from: found, to: replacement, source: 'common' });
			return replacement;
		});
	};
	apply(/(?<![\p{L}])j[eé]sus(?![\p{L}])/giu, 'Jésus');
	apply(/(?<![\p{L}])christ(?![\p{L}])/giu, 'Christ');
	apply(/(?<![\p{L}])brann?am(?![\p{L}])/giu, 'Branham');
	apply(/(?<![\p{L}])branham(?![\p{L}])/giu, 'Branham');
	// Repeated in several independent PDF/SRT pairs (see the correction audit).
	apply(/(?<![\p{L}])abraham(?![\p{L}])/giu, 'Abraham');
	apply(/(?<![\p{L}])h[eé]breux(?![\p{L}])/giu, 'Hébreux');
	apply(/(?<![\p{L}])coeur(?![\p{L}])/gu, 'cœur');
	apply(/(?<![\p{L}])Coeur(?![\p{L}])/gu, 'Cœur');
	apply(/(?<=\bfr[eè]re\s)rousse\b/giu, 'Russ');
	apply(/(?<=\b(?:fr[eè]re|ewald)\s)franck\b/giu, 'Frank');
	apply(/(?<![\p{L}])mathieu(?=\s+\d{1,3}\b)/giu, 'Matthieu');
	apply(/(?<![\p{L}])dieu(?![\p{L}])/giu, 'Dieu', (match, text) => {
		const after = text.slice(match.index + match[0].length);
		const before = text.slice(Math.max(0, match.index - 20), match.index);
		// Sermons often quote a deliberately lower-case "dieu trinitaire" or refer to a pagan god.
		return (
			!/^\s+(?:trinitaire|hindou|païen|à\s+trois\s+têtes)\b/i.test(after) &&
			!/(?:un|le|du|ce|des|les)\s+$/i.test(before)
		);
	});
	return body;
}

function applyPdfGroundedNames(body: string, pdfText: string, changes: SubtitleChange[]): string {
	// Speech recognition repeatedly renders "Frère Branham" as "Frère Bernard".
	// Require the linked transcript to name Branham and never mention Bernard:
	// a real Frère Bernard must remain untouched.
	if (
		!/(?<![\p{L}])fr[eè]re\s+branham(?![\p{L}])/iu.test(pdfText) ||
		/(?<![\p{L}])bernard(?![\p{L}])/iu.test(pdfText)
	) {
		return body;
	}
	return body.replace(
		/(?<![\p{L}])(fr[eè]re\s+)bernard(?:\s+branham)?(?![\p{L}])/giu,
		(match, prefix: string) => {
			changes.push({ from: match.slice(prefix.length), to: 'Branham', source: 'pdf' });
			return prefix + 'Branham';
		}
	);
}

function gram(words: Token[], at: number): string {
	return words
		.slice(at, at + ANCHOR_WORDS)
		.map((word) => word.normalized)
		.join(' ');
}

function anchorPairs(source: Token[], reference: Token[]): [number, number][] {
	const ref = new Map<string, number>();
	for (let i = 0; i <= reference.length - ANCHOR_WORDS; i++) {
		const key = gram(reference, i);
		ref.set(key, ref.has(key) ? -1 : i);
	}
	const candidates: [number, number][] = [];
	for (let i = 0; i <= source.length - ANCHOR_WORDS; i++) {
		const position = ref.get(gram(source, i));
		if (position !== undefined && position >= 0) candidates.push([i, position]);
	}
	// Longest increasing subsequence prevents a repeated sermon phrase from jumping
	// to a different passage in the PDF.
	const tails: number[] = [];
	const previous = new Array<number>(candidates.length).fill(-1);
	for (let i = 0; i < candidates.length; i++) {
		let lo = 0,
			hi = tails.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (candidates[tails[mid]][1] < candidates[i][1]) lo = mid + 1;
			else hi = mid;
		}
		if (lo) previous[i] = tails[lo - 1];
		tails[lo] = i;
	}
	const chain: [number, number][] = [];
	for (let i = tails.at(-1) ?? -1; i >= 0; i = previous[i]) chain.push(candidates[i]);
	const spaced: [number, number][] = [];
	for (const pair of chain.reverse()) {
		const prior = spaced.at(-1);
		if (!prior || (pair[0] >= prior[0] + ANCHOR_WORDS && pair[1] >= prior[1] + ANCHOR_WORDS)) {
			spaced.push(pair);
		}
	}
	return spaced;
}

function alignGap(
	source: Token[],
	reference: Token[],
	fromS: number,
	toS: number,
	fromR: number,
	toR: number
): [number, number][] {
	const n = toS - fromS,
		m = toR - fromR;
	if (n < 0 || m < 0 || n > 80 || m > 80) return [];
	const cost = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
	for (let i = 0; i <= n; i++) cost[i][0] = i;
	for (let j = 0; j <= m; j++) cost[0][j] = j;
	for (let i = 1; i <= n; i++)
		for (let j = 1; j <= m; j++) {
			cost[i][j] = Math.min(
				cost[i - 1][j] + 1,
				cost[i][j - 1] + 1,
				cost[i - 1][j - 1] +
					(source[fromS + i - 1].normalized === reference[fromR + j - 1].normalized ? 0 : 1)
			);
		}
	const pairs: [number, number][] = [];
	let i = n,
		j = m;
	while (i > 0 && j > 0) {
		const same = source[fromS + i - 1].normalized === reference[fromR + j - 1].normalized;
		if (cost[i][j] === cost[i - 1][j - 1] + (same ? 0 : 1)) {
			pairs.push([fromS + i - 1, fromR + j - 1]);
			i--;
			j--;
		} else if (cost[i][j] === cost[i - 1][j] + 1) i--;
		else j--;
	}
	return pairs.reverse();
}

function tokenGapDistance(source: Token[], reference: Token[]): number {
	const prior = Array.from({ length: reference.length + 1 }, (_, i) => i);
	for (let i = 1; i <= source.length; i++) {
		let diagonal = prior[0];
		prior[0] = i;
		for (let j = 1; j <= reference.length; j++) {
			const above = prior[j];
			prior[j] = Math.min(
				prior[j] + 1,
				prior[j - 1] + 1,
				diagonal + (source[i - 1].normalized === reference[j - 1].normalized ? 0 : 1)
			);
			diagonal = above;
		}
	}
	return prior[reference.length];
}

/** Copy a short PDF edit only when exact, ordered phrases bound both sides in one cue. */
function alignedPdfPassages(
	blocks: ReturnType<typeof splitSrt>,
	pdfText: string,
	source: Token[],
	reference: Token[],
	anchors: [number, number][]
): Replacement[] {
	const replacements: Replacement[] = [];
	for (let index = 1; index < anchors.length; index++) {
		const [priorS, priorR] = anchors[index - 1];
		const [nextS, nextR] = anchors[index];
		const fromS = priorS + ANCHOR_WORDS;
		const fromR = priorR + ANCHOR_WORDS;
		const sourceGap = source.slice(fromS, nextS);
		const referenceGap = reference.slice(fromR, nextR);
		const size = Math.max(sourceGap.length, referenceGap.length);
		if (size === 0 || size > 18) continue;
		// A PDF may omit spoken words or contain a page number. Neither belongs
		// in a timed cue simply because the surrounding phrases match.
		if (sourceGap.length > referenceGap.length) continue;
		if (referenceGap.some((word) => /^\d{1,3}$/.test(word.value))) continue;
		const left = source[fromS - 1];
		const right = source[nextS];
		if (left.block !== right.block) continue;
		const distance = tokenGapDistance(sourceGap, referenceGap);
		if (distance > Math.max(2, Math.floor(size * 0.35))) continue;
		const referenceLeft = reference[fromR - 1];
		const referenceRight = reference[nextR];
		const from = blocks[left.block].body.slice(left.end, right.start);
		const to = pdfText.slice(referenceLeft.end, referenceRight.start).replace(/[ \t]{2,}/g, ' ');
		// Text extraction can put page furniture inside a gap. Keep edits short and
		// avoid copying layout whitespace when the words and punctuation agree.
		if (from.length > 180 || to.length > 180 || /\n\s*\n/.test(to)) continue;
		if (from.replace(/\s+/g, ' ').trim() === to.replace(/\s+/g, ' ').trim()) continue;
		if (from.replace(/\s+/g, '') === to.replace(/\s+/g, '')) continue;
		replacements.push({ block: left.block, start: left.end, end: right.start, from, to });
	}
	return replacements;
}

/** PDF text should be extracted in reading order, without page headers. */
export function correctSubtitleSrt(
	raw: string,
	pdfText?: string
): { text: string; changes: SubtitleChange[]; comparedWords: number; differingWords: number } {
	const changes: SubtitleChange[] = [];
	const blocks = splitSrt(raw.replace(/\r\n?/g, '\n'));
	let comparedWords = 0,
		differingWords = 0;
	for (const block of blocks) if (block.body) block.body = applyCommon(block.body, changes);
	if (pdfText) {
		for (const block of blocks)
			if (block.body) block.body = applyPdfGroundedNames(block.body, pdfText, changes);
		const source = blocks.flatMap((block, index) => tokens(block.body, index));
		const reference = tokens(pdfText);
		const anchors = anchorPairs(source, reference);
		const passageReplacements = alignedPdfPassages(blocks, pdfText, source, reference, anchors);
		const pairs: [number, number][] = [];
		let priorS = 0,
			priorR = 0;
		for (const [s, r] of anchors) {
			pairs.push(...alignGap(source, reference, priorS, s, priorR, r));
			for (let i = 0; i < ANCHOR_WORDS; i++) pairs.push([s + i, r + i]);
			priorS = s + ANCHOR_WORDS;
			priorR = r + ANCHOR_WORDS;
		}
		pairs.push(...alignGap(source, reference, priorS, source.length, priorR, reference.length));
		const replacements = new Map<number, string>();
		for (let index = 0; index < pairs.length; index++) {
			const [s, r] = pairs[index];
			const a = source[s],
				b = reference[r];
			const target =
				b.value.length > 1 && b.value === b.value.toLocaleUpperCase('fr')
					? b.value[0] + b.value.slice(1).toLocaleLowerCase('fr')
					: b.value;
			comparedWords++;
			if (a.normalized !== b.normalized) differingWords++;
			if (a.value === target) continue;
			if (
				passageReplacements.some(
					(replacement) =>
						replacement.block === a.block &&
						a.start >= replacement.start &&
						a.end <= replacement.end
				)
			)
				continue;
			const prev = pairs[index - 1],
				next = pairs[index + 1];
			const nearExact = (pair?: [number, number]) =>
				pair &&
				Math.abs(pair[0] - s) <= 4 &&
				Math.abs(pair[1] - r) <= 4 &&
				source[pair[0]].normalized === reference[pair[1]].normalized;
			if (!nearExact(prev) || !nearExact(next)) continue;
			const canonical = normalize(b.value);
			const name = REFERENCE_TERMS.has(canonical);
			const sameWord = a.normalized === b.normalized;
			const context = source.slice(Math.max(0, s - 2), s).map((word) => word.normalized);
			const clericalName =
				name &&
				a.normalized.length >= 4 &&
				context.some((word) => word === 'frere' || word === 'ewald');
			const nearSpelling =
				a.normalized.length >= 5 && canonical.length >= 5 && distance(a.normalized, canonical) <= 2;
			if (
				(name && sameWord) ||
				(name && nearSpelling && !sameWord) ||
				(clericalName && b.value[0] === b.value[0].toUpperCase())
			) {
				replacements.set(s, target);
			}
		}
		const allReplacements: Replacement[] = [
			...passageReplacements,
			...[...replacements].map(([index, replacement]) => ({
				block: source[index].block,
				start: source[index].start,
				end: source[index].end,
				from: source[index].value,
				to: replacement
			}))
		];
		// Replace back-to-front within each cue so original offsets remain valid.
		for (const replacement of allReplacements.sort(
			(a, b) => b.block - a.block || b.start - a.start
		)) {
			const block = blocks[replacement.block];
			block.body =
				block.body.slice(0, replacement.start) + replacement.to + block.body.slice(replacement.end);
			changes.push({ from: replacement.from.trim(), to: replacement.to.trim(), source: 'pdf' });
		}
	}
	const text = blocks.map((block) => block.prefix + block.body + block.suffix).join('');
	return {
		text,
		changes: text === raw.replace(/\r\n?/g, '\n') ? [] : changes,
		comparedWords,
		differingWords
	};
}
