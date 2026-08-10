/** @type {import('tailwindcss').Config} */
export default {
	content: ['./index.html', './src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			fontFamily: {
				display: ["'Cormorant Garamond'", 'Georgia', 'serif'],
				body: ["'Outfit'", 'system-ui', 'sans-serif'],
				mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
			},
			colors: {
				// Same accent as the admin panel. Surfaces come from CSS variables
				// so the whole app flips theme at once — `ink` is a scale of
				// surface depth, not of luminance: ink-950 is the page, ink-900 a
				// panel, ink-700 a border. That ordering holds in both themes.
				fg: 'rgb(var(--fg) / <alpha-value>)',
				primary: '#FF880C',
				missionnaire: {
					DEFAULT: '#FF880C',
					300: '#FFBD75',
					400: '#FFA94B',
					500: '#FF880C',
					600: '#CC6A0A',
					700: '#994C08'
				},
				ink: {
					950: 'rgb(var(--ink-950) / <alpha-value>)',
					900: 'rgb(var(--ink-900) / <alpha-value>)',
					850: 'rgb(var(--ink-850) / <alpha-value>)',
					800: 'rgb(var(--ink-800) / <alpha-value>)',
					700: 'rgb(var(--ink-700) / <alpha-value>)',
					600: 'rgb(var(--ink-600) / <alpha-value>)',
					500: 'rgb(var(--ink-500) / <alpha-value>)'
				}
			}
		}
	},
	plugins: []
};
