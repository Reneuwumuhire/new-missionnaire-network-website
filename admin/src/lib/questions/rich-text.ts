export type InlineFormat = 'bold' | 'italic' | 'underline' | 'strike';

export type InlineNode =
	| { type: 'text'; text: string }
	| { type: 'link'; href: string; children: InlineNode[] }
	| { type: 'scripture'; reference: string | null; children: InlineNode[] }
	| { type: InlineFormat; children: InlineNode[] };

export type RichTextBlock =
	| {
			type: 'paragraph' | 'quote' | 'heading';
			children: InlineNode[];
	  }
	| {
			type: 'scripture';
			reference: string | null;
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

// Scripture quotes are written inline with French guillemets and an optional
// citation in parentheses, e.g. «...verset...» (Jean 14:6). We detect them so
// the renderer can highlight the verse and surface the reference as a badge.
function findScriptureQuote(
	value: string,
	start: number
): { index: number; end: number; content: string; reference: string | null } | null {
	const open = value.indexOf('«', start);
	if (open === -1) return null;
	const close = value.indexOf('»', open + 1);
	if (close === -1) return null;

	const content = value.slice(open + 1, close).trim();
	if (!content) return null;

	let end = close + 1;
	let reference: string | null = null;
	const refMatch = value.slice(end).match(/^\s*\(([^)]{1,80})\)/);
	if (refMatch && /\d/.test(refMatch[1])) {
		reference = refMatch[1].trim().replace(/\s+/g, ' ');
		end += refMatch[0].length;
	}

	return { index: open, end, content, reference };
}

type InlineToken =
	| { kind: 'marker'; index: number; marker: string; type: InlineFormat }
	| { kind: 'markdownLink'; index: number; end: number; label: string; href: string }
	| { kind: 'scripture'; index: number; end: number; content: string; reference: string | null }
	| { kind: 'autoLink'; index: number; end: number; label: string; href: string; trailing: string };

function nextInlineToken(value: string, start: number): InlineToken | null {
	const marker = nextMarker(value, start);
	const markdownLink = findMarkdownLink(value, start);
	const autoLink = findAutoLink(value, start);
	const scripture = findScriptureQuote(value, start);
	const candidates: InlineToken[] = [];
	if (marker) candidates.push({ ...marker, kind: 'marker' });
	if (markdownLink) candidates.push({ ...markdownLink, kind: 'markdownLink' });
	if (autoLink) candidates.push({ ...autoLink, kind: 'autoLink' });
	if (scripture) candidates.push({ ...scripture, kind: 'scripture' });

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

		if (opener.kind === 'scripture') {
			nodes.push({
				type: 'scripture',
				reference: opener.reference,
				children: parseInlineFormatting(opener.content)
			});
			cursor = opener.end;
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

// A standalone, fully upper-case line (e.g. "IKIBAZO CYA MBERE KW'ISABATO")
// acts as a section heading written by the author.
function isHeadingLine(line: string): boolean {
	const trimmed = line.trim();
	if (trimmed.length < 3 || trimmed.length > 90) return false;
	if (trimmed.includes('«') || trimmed.includes('»')) return false;
	// Reject anything with lower-case letters — headings are written in caps.
	if (/\p{Ll}/u.test(trimmed)) return false;
	// Require at least one run of upper-case letters so digits/punctuation alone
	// (like a bare list marker) are not mistaken for a heading.
	return /\p{Lu}{2,}/u.test(trimmed);
}

function trimInlineEdges(nodes: InlineNode[]): InlineNode[] {
	const result = nodes.slice();
	while (result.length && result[0].type === 'text') {
		const text = result[0].text.replace(/^\s+/, '');
		if (!text) result.shift();
		else {
			result[0] = { type: 'text', text };
			break;
		}
	}
	while (result.length && result[result.length - 1].type === 'text') {
		const last = result[result.length - 1] as { type: 'text'; text: string };
		const text = last.text.replace(/\s+$/, '');
		if (!text) result.pop();
		else {
			result[result.length - 1] = { type: 'text', text };
			break;
		}
	}
	return result;
}

function hasVisibleInline(nodes: InlineNode[]): boolean {
	return nodes.some((node) => node.type !== 'text' || node.text.trim().length > 0);
}

// Authors often wrap a whole verse in emphasis (e.g. *«verse»*). Treat a lone
// scripture quote inside a single formatting wrapper as a scripture quote too.
function asScriptureNode(
	node: InlineNode
): { reference: string | null; children: InlineNode[] } | null {
	if (node.type === 'scripture') return { reference: node.reference, children: node.children };

	if (
		node.type === 'italic' ||
		node.type === 'bold' ||
		node.type === 'underline' ||
		node.type === 'strike'
	) {
		const meaningful = node.children.filter(
			(child) => child.type !== 'text' || child.text.trim().length > 0
		);
		if (meaningful.length === 1 && meaningful[0].type === 'scripture') {
			return { reference: meaningful[0].reference, children: meaningful[0].children };
		}
	}

	return null;
}

// A paragraph that contains scripture quotes is split so each verse becomes its
// own block-level callout, with the surrounding commentary kept as paragraphs.
function pushParagraphBlocks(children: InlineNode[], blocks: RichTextBlock[]): void {
	const nodes = children.slice();
	let buffer: InlineNode[] = [];
	const flush = () => {
		const trimmed = trimInlineEdges(buffer);
		if (hasVisibleInline(trimmed)) blocks.push({ type: 'paragraph', children: trimmed });
		buffer = [];
	};

	for (let index = 0; index < nodes.length; index += 1) {
		const scripture = asScriptureNode(nodes[index]);
		if (!scripture) {
			buffer.push(nodes[index]);
			continue;
		}

		flush();

		// The citation is sometimes written just after the verse (outside any
		// emphasis), e.g. *«verse»* (Jean 14:6) — pull it from the next sibling.
		let reference = scripture.reference;
		const next = nodes[index + 1];
		if (!reference && next && next.type === 'text') {
			const match = next.text.match(/^\s*\(([^)]{1,80})\)/);
			if (match && /\d/.test(match[1])) {
				reference = match[1].trim().replace(/\s+/g, ' ');
				nodes[index + 1] = { type: 'text', text: next.text.slice(match[0].length) };
			}
		}

		blocks.push({ type: 'scripture', reference, children: scripture.children });
	}
	flush();
}

function parseListLine(line: string): { type: 'unorderedList' | 'orderedList'; text: string } | null {
	const unordered = line.match(/^\s*[-*]\s+(.+)$/);
	if (unordered) return { type: 'unorderedList', text: unordered[1] };

	const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
	if (ordered) return { type: 'orderedList', text: ordered[1] };

	return null;
}

export function parseRichText(value: string | null | undefined): RichTextBlock[] {
	const text = (value ?? '')
		.replaceAll('\r\n', '\n')
		.replaceAll('\r', '\n')
		// Strip zero-width and bidirectional marks (often pasted around Bible
		// references) so citation matching and display stay clean.
		.replace(/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, '')
		.trim();
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

		const isHeading = !isQuote && collected.length === 1 && isHeadingLine(collected[0]);
		const children = parseInlineFormatting(collected.join('\n'));

		if (isHeading) {
			blocks.push({ type: 'heading', children });
		} else if (isQuote) {
			blocks.push({ type: 'quote', children });
		} else {
			pushParagraphBlocks(children, blocks);
		}
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
