const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizePlainText(value: unknown, maxLength = 5000): string {
	if (typeof value !== 'string') return '';
	return value
		.replaceAll('\r\n', '\n')
		.replaceAll('\r', '\n')
		.replace(CONTROL_CHARS, '')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{4,}/g, '\n\n\n')
		.trim()
		.slice(0, maxLength);
}

export function validateModerationReason(value: unknown): string | null {
	const reason = sanitizePlainText(value, 500);
	return reason || null;
}

export function validateOfficialAnswer(value: unknown): { ok: true; body: string } | { ok: false; error: string } {
	const body = sanitizePlainText(value, 5000);
	if (body.length < 10) return { ok: false, error: 'La réponse officielle est trop courte.' };
	return { ok: true, body };
}

export function validateBibleReference(input: {
	passage: unknown;
	text: unknown;
	translation: unknown;
}): { ok: true; passage: string; text: string | null; translation: string | null } | { ok: false; error: string } {
	const passage = sanitizePlainText(input.passage, 80);
	const text = sanitizePlainText(input.text, 1000) || null;
	const translation = sanitizePlainText(input.translation, 40) || null;
	if (passage.length < 2) return { ok: false, error: 'Indiquez une référence biblique.' };
	return { ok: true, passage, text, translation };
}

function normalizeReferenceHref(value: unknown): string {
	const href = sanitizePlainText(value, 600);
	if (!href) return '';

	if (href.startsWith('/') && !href.startsWith('//') && !/\s/.test(href)) {
		return href;
	}

	try {
		const parsed = new URL(/^https?:\/\//i.test(href) ? href : `https://${href}`);
		return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : '';
	} catch {
		return '';
	}
}

export function validateManualReference(input: {
	title: unknown;
	href: unknown;
	note?: unknown;
	type?: unknown;
}): { ok: true; title: string; href: string; note: string | null } | { ok: false; error: string } {
	const title = sanitizePlainText(input.title, 140);
	const href = normalizeReferenceHref(input.href);
	const note = sanitizePlainText(input.note, 1600) || null;
	const type = sanitizePlainText(input.type, 30);
	if (title.length < 2) return { ok: false, error: 'Indiquez un titre lisible pour la référence.' };
	if (!href) return { ok: false, error: 'Indiquez un lien valide en http(s) ou un lien interne commençant par /.' };
	if (type === 'text' && !note) return { ok: false, error: 'Collez le texte cité pour cette référence.' };
	return { ok: true, title, href, note };
}

export function validateEditedQuestion(input: {
	title: unknown;
	body: unknown;
	category: unknown;
	tags: unknown;
}): { ok: true; title: string; body: string; category: string | null; tags: string[] } | { ok: false; error: string } {
	const title = sanitizePlainText(input.title, 140);
	const body = sanitizePlainText(input.body, 4000);
	const category = sanitizePlainText(input.category, 80) || null;
	if (title.length < 8) return { ok: false, error: 'Titre trop court.' };
	if (body.length < 20) return { ok: false, error: 'Question trop courte.' };
	const tags =
		typeof input.tags === 'string'
			? input.tags
					.split(',')
					.map((tag) => sanitizePlainText(tag, 32).toLowerCase())
					.filter(Boolean)
					.slice(0, 8)
			: [];
	return { ok: true, title, body, category, tags };
}
