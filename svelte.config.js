import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/kit/vite';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		paths: {
			base: '' // or your actual base path if not root
		}
	},
	preprocess: [
		vitePreprocess({
			typescript: {
				tsconfigFile: './tsconfig.json'
			}
		})
	]
};

export default config;
