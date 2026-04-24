import { dev } from '$app/environment';

// Vercel Image Optimization ships as an `/_vercel/image` endpoint on any
// deployment that declares `images` in svelte.config.js. It resizes +
// negotiates AVIF/WebP + caches at the edge. Mirrors the public site helper
// so the two codebases share the same blur-up behavior.

const EXTERNAL_URL_PATTERN = /^https?:\/\//i;

// Must stay in sync with `images.sizes` in svelte.config.js. A `w` value
// that isn't in this list makes Vercel return 400 INVALID_IMAGE_OPTIMIZE_REQUEST,
// so the helper snaps any caller-requested width up to the nearest allowed size.
const ALLOWED_WIDTHS = [24, 96, 192, 256, 384, 512, 1080, 1920] as const;
const MAX_ALLOWED_WIDTH = 1920;

function snapWidth(requested: number): number {
	for (const w of ALLOWED_WIDTHS) {
		if (w >= requested) return w;
	}
	return MAX_ALLOWED_WIDTH;
}

function buildSrc(url: string, width: number, quality: number): string {
	if (!url) return url;
	if (dev) return url;
	if (!EXTERNAL_URL_PATTERN.test(url)) return url;
	const params = new URLSearchParams({
		url,
		w: String(snapWidth(width)),
		q: String(quality)
	});
	return `/_vercel/image?${params.toString()}`;
}

export function vercelImage(url: string, width: number, quality = 75): string {
	return buildSrc(url, width, quality);
}

export function vercelImageSrcSet(url: string, baseWidth: number, quality = 75): string {
	if (!url) return '';
	const oneX = buildSrc(url, baseWidth, quality);
	const twoX = buildSrc(url, baseWidth * 2, quality);
	return `${oneX} 1x, ${twoX} 2x`;
}

export function vercelImagePlaceholder(url: string): string {
	return buildSrc(url, 24, 30);
}
