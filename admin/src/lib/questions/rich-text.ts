export type InlineFormat = 'bold' | 'underline' | 'strike';

export type InlineNode =
	| { type: 'text'; text: string }
	| { type: InlineFormat; children: InlineNode[] };

export type RichTextBlock =
	| {
			type: 'paragraph' | 'quote';
			children: InlineNode[];
	  }
	| {
			type: 'unorderedList' | 'orderedList';
			items: InlineNode[][];
	  };

const INLINE_MARKERS: Array<{ marker: string; type: InlineFormat }> = [
	{ marker: '**', type: 'bold' },
	{ marker: '__', type: 'underline' },
	{ marker: '~~', type: 'strike' }
];

function nextMarker(value: string, start: number): { index: number; marker: string; type: InlineFormat } | null {
	let next: { index: number; marker: string; type: InlineFormat } | null = null;
	for (const entry of INLINE_MARKERS) {
		const index = value.indexOf(entry.marker, start);
		if (index === -1) continue;
		if (!next || index < next.index) next = { index, marker: entry.marker, type: entry.type };
	}
	return next;
}

export function parseInlineFormatting(value: string): InlineNode[] {
	const nodes: InlineNode[] = [];
	let cursor = 0;

	while (cursor < value.length) {
		const opener = nextMarker(value, cursor);
		if (!opener) {
			nodes.push({ type: 'text', text: value.slice(cursor) });
			break;
		}

		if (opener.index > cursor) {
			nodes.push({ type: 'text', text: value.slice(cursor, opener.index) });
		}

		const contentStart = opener.index + opener.marker.length;
		const closerIndex = value.indexOf(opener.marker, contentStart);
		if (closerIndex === -1 || closerIndex === contentStart) {
			nodes.push({ type: 'text', text: opener.marker });
			cursor = contentStart;
			continue;
		}

		nodes.push({
			type: opener.type,
			children: parseInlineFormatting(value.slice(contentStart, closerIndex))
		});
		cursor = closerIndex + opener.marker.length;
	}

	return nodes;
}

function parseListLine(line: string): { type: 'unorderedList' | 'orderedList'; text: string } | null {
	const unordered = line.match(/^\s*[-*]\s+(.+)$/);
	if (unordered) return { type: 'unorderedList', text: unordered[1] };

	const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
	if (ordered) return { type: 'orderedList', text: ordered[1] };

	return null;
}

export function parseRichText(value: string | null | undefined): RichTextBlock[] {
	const text = (value ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
	if (!text) return [];

	const blocks: RichTextBlock[] = [];
	const lines = text.split('\n');
	let cursor = 0;

	while (cursor < lines.length) {
		if (!lines[cursor].trim()) {
			cursor += 1;
			continue;
		}

		const listLine = parseListLine(lines[cursor]);
		if (listLine) {
			const listType = listLine.type;
			const items: InlineNode[][] = [];

			while (cursor < lines.length && lines[cursor].trim()) {
				const item = parseListLine(lines[cursor]);
				if (!item || item.type !== listType) break;
				items.push(parseInlineFormatting(item.text));
				cursor += 1;
			}

			blocks.push({ type: listType, items });
			continue;
		}

		const isQuote = /^>\s?/.test(lines[cursor]);
		const collected: string[] = [];

		while (cursor < lines.length && lines[cursor].trim()) {
			if (parseListLine(lines[cursor])) break;
			const lineIsQuote = /^>\s?/.test(lines[cursor]);
			if (lineIsQuote !== isQuote) break;
			collected.push(isQuote ? lines[cursor].replace(/^>\s?/, '') : lines[cursor]);
			cursor += 1;
		}

		blocks.push({
			type: isQuote ? 'quote' : 'paragraph',
			children: parseInlineFormatting(collected.join('\n'))
		});
	}

	return blocks;
}

export function stripRichTextFormatting(value: string | null | undefined): string {
	return (value ?? '')
		.replace(/\*\*(.*?)\*\*/gs, '$1')
		.replace(/__(.*?)__/gs, '$1')
		.replace(/~~(.*?)~~/gs, '$1')
		.replace(/^>\s?/gm, '')
		.replace(/^\s*[-*]\s+/gm, '')
		.replace(/^\s*\d+[.)]\s+/gm, '')
		.trim();
}
