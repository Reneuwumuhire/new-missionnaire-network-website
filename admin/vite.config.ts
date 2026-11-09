import nodeAdapter from '@sveltejs/adapter-node';
import vercelAdapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const isNodeDeployment = process.env.DEPLOY_TARGET === 'node';

export default defineConfig({
	plugins: [
		sveltekit({
			alias: { $lib: './src/lib', '$lib/*': './src/lib/*' },
			adapter: isNodeDeployment
				? nodeAdapter()
				: vercelAdapter({
						runtime: 'nodejs24.x',
						images: {
							sizes: [24, 96, 192, 256, 384, 512, 1080, 1920],
							formats: ['image/avif', 'image/webp'],
							minimumCacheTTL: 2592000,
							remotePatterns: [{ protocol: 'https', hostname: '**.amazonaws.com' }]
						}
					}),
			preprocess: vitePreprocess()
		})
	]
});
