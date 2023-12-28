import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/kit/vite';
import preprocess from 'svelte-preprocess';

/** @type {import("@sveltejs/kit").Config} */
const config = {
	preprocess: [vitePreprocess(), preprocess()],
	kit: {
		adapter: adapter(),
		alias: {
			"@mnlib": "./mn-lib",
			"@mnlib/*": "./mn-lib/*"
		}
	}
};
export default config;
