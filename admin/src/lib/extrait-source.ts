export type ExtraitSourceLink = { kind: string; label: string; href: string };
export type ExtraitSourceSuggestion = {
	id: string;
	kind: 'recording' | 'sermon';
	title: string;
	subtitle: string;
	links: ExtraitSourceLink[];
};

export function slugifySource(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-{2,}/g, '-');
}

export function sourceSermonSlug(sermon: Record<string, unknown>): string {
	const title = String(
		sermon.french_title ||
			sermon.english_title ||
			sermon.full_date_code ||
			sermon.date_code ||
			'predication'
	);
	const date = slugifySource(String(sermon.date_code || sermon.full_date_code || ''));
	const base = slugifySource(title);
	return date && !base.endsWith(`-${date}`) ? `${base}-${date}` : base;
}

export function sourcePublicUrl(value: unknown): string {
	if (typeof value !== 'string' || !value) return '';
	try {
		const url = new URL(value);
		return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
			? url.href
			: '';
	} catch {
		return '';
	}
}

export function selectedSourceValues(source: ExtraitSourceSuggestion) {
	const href = (kind: string) => source.links.find((link) => link.kind === kind)?.href ?? '';
	return {
		sourceKind: source.kind,
		sourceId: source.id,
		sourceTitle: source.title,
		sermonUrl: href('sermon'),
		liveUrl: href('live'),
		videoUrl: href('video'),
		pdfUrl: href('pdf'),
		audioUrl: href('audio'),
		transcriptionUrl: href('transcription')
	};
}
