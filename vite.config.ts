import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import path from 'path';

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
			'@mnlib': path.resolve(__dirname, './mn-lib')
		}
	}
});
