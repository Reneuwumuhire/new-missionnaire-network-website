import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type UserConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [sveltekit()],
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
