export const QUESTION_CATEGORIES = [
	'Bible',
	'Doctrine',
	'Vie chrétienne',
	'Prière',
	'Famille',
	'Jeunesse',
	'Témoignage',
	'Autre'
] as const;

export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number];

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const MAX_TITLE_LENGTH = 140;
const MAX_QUESTION_BODY_LENGTH = 4000;
const MAX_REPLY_BODY_LENGTH = 2500;
const MAX_REPORT_NOTES_LENGTH = 800;

export interface ValidationResult<T> {
	ok: boolean;
	value?: T;
	error?: string;
}

export function sanitizePlainText(value: unknown, maxLength = MAX_QUESTION_BODY_LENGTH): string {
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

export function normalizeForDuplicateCheck(value: string): string {
	return sanitizePlainText(value, 10_000).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function slugifyQuestionTitle(title: string): string {
	const slug = title
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 72)
		.replace(/-+$/g, '');
	return slug || 'question';
}

export function coerceQuestionCategory(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim();
	return QUESTION_CATEGORIES.includes(normalized as QuestionCategory) ? normalized : null;
}

export function validateQuestionInput(input: {
	title: unknown;
	body: unknown;
	category?: unknown;
	tags?: unknown;
}): ValidationResult<{ title: string; body: string; category: string | null; tags: string[] }> {
	const title = sanitizePlainText(input.title, MAX_TITLE_LENGTH);
	const body = sanitizePlainText(input.body, MAX_QUESTION_BODY_LENGTH);
	const category = coerceQuestionCategory(input.category);

	if (title.length < 8) {
		return { ok: false, error: 'Le titre doit contenir au moins 8 caractères.' };
	}

	if (body.length < 20) {
		return { ok: false, error: 'La question doit contenir au moins 20 caractères.' };
	}

	const tags =
		typeof input.tags === 'string'
			? input.tags
					.split(',')
					.map((tag) => sanitizePlainText(tag, 32).toLowerCase())
					.filter((tag) => /^[a-z0-9 -]{2,32}$/.test(tag))
					.slice(0, 6)
			: [];

	return { ok: true, value: { title, body, category, tags } };
}

export function validateReplyInput(input: { body: unknown }): ValidationResult<{ body: string }> {
	const body = sanitizePlainText(input.body, MAX_REPLY_BODY_LENGTH);
	if (body.length < 5) {
		return { ok: false, error: 'La réponse doit contenir au moins 5 caractères.' };
	}
	return { ok: true, value: { body } };
}

export function validateReportInput(input: {
	reason: unknown;
	notes?: unknown;
}): ValidationResult<{ reason: string; notes: string | null }> {
	const reason = sanitizePlainText(input.reason, 80);
	const notes = sanitizePlainText(input.notes, MAX_REPORT_NOTES_LENGTH);

	if (reason.length < 3) {
		return { ok: false, error: 'Choisissez une raison de signalement.' };
	}

	return { ok: true, value: { reason, notes: notes || null } };
}
