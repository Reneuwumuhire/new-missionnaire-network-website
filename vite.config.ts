import nodeAdapter from '@sveltejs/adapter-node';
import vercelAdapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type UserConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isNodeDeployment = process.env.DEPLOY_TARGET === 'node';

export default defineConfig({
	plugins: [
		sveltekit({
			alias: { $lib: './src/lib', '$lib/*': './src/lib/*' },
			adapter: isNodeDeployment
				? nodeAdapter()
				: vercelAdapter({
						runtime: 'nodejs22.x',
						images: {
							sizes: [24, 96, 192, 256, 384, 512, 1080, 1920],
							formats: ['image/avif', 'image/webp'],
							minimumCacheTTL: 2592000,
							remotePatterns: [{ protocol: 'https', hostname: '**.amazonaws.com' }]
						}
					}),
			preprocess: vitePreprocess(),
			dynamicCompileOptions({ filename }) {
				if (!filename.includes('node_modules')) return { runes: true };
			}
		})
	],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	},
	server: {
		port: 8080,
		fs: {
			strict: false
		}
	},
	resolve: {
		alias: {
			'@mnlib': path.resolve(__dirname, './mn-lib'),
			'@mnlib/*': path.resolve(__dirname, './mn-lib/*')
		}
	}
} as UserConfig & { test: Record<string, unknown> });
