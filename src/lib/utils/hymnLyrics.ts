import { songSlug } from './songSlug';

type LyricPart = { text: string; repeat?: number };
type LyricBlock = {
	heading?: string;
	number?: number;
	block?: number;
	refrain: boolean;
	lines: LyricPart[][];
};

function splitRepeats(text: string): LyricPart[] {
	const parts: LyricPart[] = [];
	let end = 0;
	for (const match of text.matchAll(/\{([^{}]+)\}\s*[x×]\s*(\d+)\b/gi)) {
		const before = text.slice(end, match.index).trim();
		if (before) parts.push({ text: before });
		parts.push({ text: match[1].trim(), repeat: Number(match[2]) });
		end = match.index + match[0].length;
	}
	const after = text.slice(end).trim();
	if (after) parts.push({ text: after });
	return parts;
}

export function formatHymnLyrics(value: unknown, title: string): LyricBlock[] {
	if (!Array.isArray(value)) return [];
	const blocks: LyricBlock[] = [];
	const titleSlug = songSlug(title);
	for (const [index, row] of value.entries()) {
		const line = typeof row === 'string' ? { text: row } : row;
		if (!line || typeof line.text !== 'string' || !line.text.trim()) continue;
		const text = line.text.trim();
		if (line.kind === 'heading') {
			const slug = songSlug(text);
			if (index === 0 && titleSlug && (slug === titleSlug || slug.endsWith(`-${titleSlug}`)))
				continue;
			blocks.push({ heading: text, refrain: false, lines: [] });
			continue;
		}
		const number =
			Number.isInteger(line.verse_number) && line.verse_number > 0
				? Number(line.verse_number)
				: undefined;
		const block = typeof line.block === 'number' ? line.block : undefined;
		const refrain = line.role === 'refrain';
		const previous = blocks.at(-1);
		const parts = splitRepeats(text);
		if (
			previous &&
			!previous.heading &&
			previous.refrain === refrain &&
			(block !== undefined
				? previous.block === block
				: number !== undefined && previous.number === number)
		) {
			previous.lines.push(parts);
		} else {
			blocks.push({ number, block, refrain, lines: [parts] });
		}
	}
	return blocks;
}
