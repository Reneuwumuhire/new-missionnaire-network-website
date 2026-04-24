import { dev } from '$app/environment';

// Vercel Image Optimization ships as an `/_vercel/image` endpoint on any
// deployment that declares `images` in vercel.json. It resizes + negotiates
// AVIF/WebP + caches at the edge. Configured widths live in vercel.json.
//
// In dev (`vite dev`) that endpoint isn't served, so the helper no-ops back
// to the source URL — we only pay the optimization cost in prod, and local
// dev shows the raw S3 image exactly as it did before.

const EXTERNAL_URL_PATTERN = /^https?:\/\//i;

function buildSrc(url: string, width: number, quality: number): string {
	if (!url) return url;
	if (dev) return url;
	// Skip anything that isn't an absolute http(s) URL — Vercel's optimizer
	// accepts only fully-qualified URLs for remote images, and same-origin
	// paths (like /icons/logo.png) are served directly anyway.
	if (!EXTERNAL_URL_PATTERN.test(url)) return url;
	const params = new URLSearchParams({
		url,
		w: String(width),
		q: String(quality)
	});
	return `/_vercel/image?${params.toString()}`;
}

export function vercelImage(url: string, width: number, quality = 75): string {
	return buildSrc(url, width, quality);
}

// Emit a `srcset` with 1x + 2x variants for DPR-aware browsers. `baseWidth`
// is the CSS pixel width of the rendered image.
export function vercelImageSrcSet(url: string, baseWidth: number, quality = 75): string {
	if (!url) return '';
	const oneX = buildSrc(url, baseWidth, quality);
	const twoX = buildSrc(url, baseWidth * 2, quality);
	return `${oneX} 1x, ${twoX} 2x`;
}

// Tiny, heavily-compressed variant used as a blur-up placeholder. 24px wide
// at q=30 lands around ~1 KB per image and compresses further once CSS-blurred.
// Width must match an entry in vercel.json#images.sizes.
export function vercelImagePlaceholder(url: string): string {
	return buildSrc(url, 24, 30);
}
