import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Tauri drives this dev server; the fixed port + strictPort matter because
// tauri.conf.json points the webview at it.
export default defineConfig({
	plugins: [svelte()],
	clearScreen: false,
	server: { port: 5183, strictPort: true },
	build: { target: 'safari15', sourcemap: true }
});
