// Slug helper shared between the share-link builder (audio player) and
// the lookup endpoint (api/music-audio/[id]). Keeping a single canonical
// implementation means the URL we generate is always the URL the
// resolver will recognise.
//
// Slug rules (intentionally simple):
//   - strip diacritics ("Écoutez" → "ecoutez")
//   - lowercase everything
//   - collapse any run of non-[a-z0-9] into a single hyphen
//   - trim leading/trailing hyphens
//
// Apostrophes, spaces and other punctuation are all treated the same
// way: as a separator. Two songs whose titles only differ in those
// characters produce the same slug — known tradeoff. The resolver
// handles collisions by returning the first match; ObjectId-based URLs
// remain durable for any case where the slug is ambiguous or the title
// later gets renamed.

const DIACRITICS = /[̀-ͯ]/g;
const NON_ALPHANUM = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;

export function songSlug(title: string | null | undefined): string {
	if (!title) return '';
	return title
		.normalize('NFD')
		.replace(DIACRITICS, '')
		.toLowerCase()
		.replace(NON_ALPHANUM, '-')
		.replace(EDGE_HYPHENS, '');
}

// True for a 24-char hex string, the MongoDB ObjectId shape. The
// resolver uses this to decide whether to take the ObjectId fast path
// before falling back to a title-slug lookup.
export function looksLikeObjectId(value: string): boolean {
	return /^[a-f0-9]{24}$/i.test(value);
}
