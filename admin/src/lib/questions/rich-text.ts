export type InlineFormat = 'bold' | 'italic' | 'underline' | 'strike';

export type InlineNode =
	| { type: 'text'; text: string }
	| { type: 'link'; href: string; children: InlineNode[] }
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
	{ marker: '~~', type: 'strike' },
	{ marker: '*', type: 'italic' }
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

function safeHref(value: string): string | null {
	const href = value.trim();
	if (!href) return null;
	if (href.startsWith('/')) return href.startsWith('//') ? null : href;

	try {
		const parsed = new URL(href);
		if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
	} catch {
		return null;
	}

	return null;
}

function findMarkdownLink(value: string, start: number): { index: number; end: number; label: string; href: string } | null {
	let index = value.indexOf('[', start);
	while (index !== -1) {
		const labelEnd = value.indexOf('](', index + 1);
		if (labelEnd === -1) return null;
		const hrefEnd = value.indexOf(')', labelEnd + 2);
		if (hrefEnd === -1) return null;

		const label = value.slice(index + 1, labelEnd).trim();
		const href = safeHref(value.slice(labelEnd + 2, hrefEnd));
		if (label && href) return { index, end: hrefEnd + 1, label, href };

		index = value.indexOf('[', index + 1);
	}
	return null;
}

function stripTrailingUrlPunctuation(url: string): { href: string; trailing: string } {
	let href = url;
	let trailing = '';
	while (/[.,;:!?)]$/.test(href)) {
		trailing = href[href.length - 1] + trailing;
		href = href.slice(0, -1);
	}
	return { href, trailing };
}

function findAutoLink(value: string, start: number): { index: number; end: number; label: string; href: string; trailing: string } | null {
	const match = value.slice(start).match(/https?:\/\/[^\s<>"']+/i);
	if (!match || match.index == null) return null;

	const index = start + match.index;
	const rawUrl = match[0];
	const { href: strippedHref, trailing } = stripTrailingUrlPunctuation(rawUrl);
	const href = safeHref(strippedHref);
	if (!href) return null;

	return {
		index,
		end: index + strippedHref.length,
		label: strippedHref,
		href,
		trailing
	};
}

type InlineToken =
	| { kind: 'marker'; index: number; marker: string; type: InlineFormat }
	| { kind: 'markdownLink'; index: number; end: number; label: string; href: string }
	| { kind: 'autoLink'; index: number; end: number; label: string; href: string; trailing: string };

function nextInlineToken(value: string, start: number): InlineToken | null {
	const marker = nextMarker(value, start);
	const markdownLink = findMarkdownLink(value, start);
	const autoLink = findAutoLink(value, start);
	const candidates: InlineToken[] = [];
	if (marker) candidates.push({ ...marker, kind: 'marker' });
	if (markdownLink) candidates.push({ ...markdownLink, kind: 'markdownLink' });
	if (autoLink) candidates.push({ ...autoLink, kind: 'autoLink' });

	return candidates.sort((a, b) => a.index - b.index)[0] ?? null;
}

export function parseInlineFormatting(value: string): InlineNode[] {
	const nodes: InlineNode[] = [];
	let cursor = 0;

	while (cursor < value.length) {
		const opener = nextInlineToken(value, cursor);
		if (!opener) {
			nodes.push({ type: 'text', text: value.slice(cursor) });
			break;
		}

		if (opener.index > cursor) {
			nodes.push({ type: 'text', text: value.slice(cursor, opener.index) });
		}

		if (opener.kind === 'markdownLink') {
			nodes.push({
				type: 'link',
				href: opener.href,
				children: parseInlineFormatting(opener.label)
			});
			cursor = opener.end;
			continue;
		}

		if (opener.kind === 'autoLink') {
			nodes.push({
				type: 'link',
				href: opener.href,
				children: [{ type: 'text', text: opener.label }]
			});
			if (opener.trailing) nodes.push({ type: 'text', text: opener.trailing });
			cursor = opener.end + opener.trailing.length;
			continue;
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
		.replace(/\*(.*?)\*/gs, '$1')
		.replace(/__(.*?)__/gs, '$1')
		.replace(/~~(.*?)~~/gs, '$1')
		.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g, '$1')
		.replace(/^>\s?/gm, '')
		.replace(/^\s*[-*]\s+/gm, '')
		.replace(/^\s*\d+[.)]\s+/gm, '')
		.trim();
}
