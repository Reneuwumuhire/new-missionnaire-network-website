// Shared SEO/Open Graph helpers.
//
// The root +layout.svelte renders the SINGLE canonical set of
// <title>/description/og:*/twitter:* tags from `$page.data.meta` —
// pages must never emit their own og: tags in <svelte:head> or
// crawlers (WhatsApp/Facebook handle duplicates inconsistently) can
// pick the layout default over the page-specific values. Instead each
// route returns `meta: pageMeta(path, {...})` from its `load`.
export const SITE_URL = 'https://missionnaire.net';
export const SITE_NAME = 'Missionnaire Network';
export const DEFAULT_SEO_TITLE = 'Missionnaire Network | Prédications et Cantiques du Message';
export const DEFAULT_SEO_DESCRIPTION =
	"Prédications, cantiques, littérature et transcriptions du Message de l'Heure pour l'édification spirituelle.";
// 1200×630 JPEG in /static — the exact size Facebook/WhatsApp/Twitter want.
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.jpg`;

export type PageMeta = {
	title?: string;
	description?: string;
	/** Absolute canonical URL (og:url + <link rel=canonical>). */
	url?: string;
	/** Absolute image URL. Omit to fall back to the default 1200×630 og-image. */
	image?: string;
	/** Only set when the REAL dimensions of `image` are known. */
	imageWidth?: number;
	imageHeight?: number;
	/** og:type — defaults to 'website' in the layout. */
	type?: string;
	noindex?: boolean;
};

/** Build a PageMeta whose canonical URL is `SITE_URL` + an absolute path
 *  (e.g. `pageMeta('/predications', { title, description })`). */
export function pageMeta(path: string, meta: Omit<PageMeta, 'url'>): PageMeta {
	return { url: `${SITE_URL}${path}`, ...meta };
}

// Social previews truncate titles past ~60 chars; keep the brand suffix
// only when it fits, and ellipsise unusually long titles as a last resort.
const OG_TITLE_LIMIT = 60;

export function shareTitle(title: string, brandSuffix = ` · ${SITE_NAME}`): string {
	const branded = `${title}${brandSuffix}`;
	if (branded.length <= OG_TITLE_LIMIT) return branded;
	if (title.length <= OG_TITLE_LIMIT) return title;
	return `${title.slice(0, OG_TITLE_LIMIT - 1).trimEnd()}…`;
}

/** Clamp a description to the ~155-char window previews display. */
export function shareDescription(text: string, limit = 155): string {
	const clean = text.replace(/\s+/g, ' ').trim();
	if (clean.length <= limit) return clean;
	return `${clean.slice(0, limit - 1).trimEnd()}…`;
}
