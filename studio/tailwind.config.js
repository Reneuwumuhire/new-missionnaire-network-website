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
				// Same accent as the admin panel; the surfaces are dark because a
				// stream operator stares at this next to a lit stage.
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
					950: '#0B0B0D',
					900: '#111114',
					850: '#16161A',
					800: '#1C1C21',
					700: '#26262D',
					600: '#33333C',
					500: '#4A4A56'
				}
			}
		}
	},
	plugins: []
};
