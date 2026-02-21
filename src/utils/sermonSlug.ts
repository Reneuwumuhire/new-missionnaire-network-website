export type SermonSlugInput = {
	french_title?: string | null;
	english_title?: string | null;
	date_code?: string | null;
	full_date_code?: string | null;
	iso_date?: string | null;
};

const DATE_CODE_SUFFIX_REGEX = /(\d{2}-\d{4}[a-z]?)$/i;

export function slugifySermonPart(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-{2,}/g, '-');
}

export function buildSermonSlug(sermon: SermonSlugInput): string {
	const titleSource =
		sermon.french_title ||
		sermon.english_title ||
		sermon.full_date_code ||
		sermon.date_code ||
		sermon.iso_date ||
		'predication';
	const titleSlug = slugifySermonPart(titleSource);

	const dateSource = sermon.date_code || sermon.full_date_code;
	const dateSlug = dateSource ? slugifySermonPart(dateSource) : '';

	if (dateSlug && titleSlug && !titleSlug.endsWith(`-${dateSlug}`)) {
		return `${titleSlug}-${dateSlug}`;
	}

	return titleSlug || dateSlug || 'predication';
}

export function extractDateCodeFromSlug(slug: string): string | null {
	const match = slug.match(DATE_CODE_SUFFIX_REGEX);
	if (!match) return null;
	return match[1].toUpperCase();
}
