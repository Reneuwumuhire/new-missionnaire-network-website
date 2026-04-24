import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			runtime: 'nodejs22.x',
			// Vercel image optimization: exposes `/_vercel/image` for resized,
			// AVIF/WebP-negotiated, edge-cached thumbnails. Mirrors the public
			// site's config so admin can use the same BlurUpImage component.
			images: {
				sizes: [24, 96, 192, 256, 384, 512, 1080, 1920],
				formats: ['image/avif', 'image/webp'],
				minimumCacheTTL: 2592000,
				remotePatterns: [{ protocol: 'https', hostname: '**.amazonaws.com' }]
			}
		})
	},
	preprocess: vitePreprocess()
};

export default config;
