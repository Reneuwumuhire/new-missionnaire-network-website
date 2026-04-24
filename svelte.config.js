import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			runtime: 'nodejs22.x',
			// Vercel Image Optimization config must live on the adapter — at build
			// time, adapter-vercel writes `.vercel/output/config.json` and that
			// supersedes the `images` block in `vercel.json`. Without this, the
			// `/_vercel/image` endpoint has no remote-pattern allowlist and every
			// S3 thumbnail proxy request 4xx's.
			images: {
				sizes: [24, 96, 192, 256, 384, 512, 1080, 1920],
				formats: ['image/avif', 'image/webp'],
				minimumCacheTTL: 2592000,
				remotePatterns: [
					{ protocol: 'https', hostname: '**.amazonaws.com' }
				]
			}
		})
	},
	preprocess: vitePreprocess()
};

export default config;
