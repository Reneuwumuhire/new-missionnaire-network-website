/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			fontFamily: {
				display: ["'Cormorant Garamond'", 'Georgia', 'serif'],
				body: ["'Outfit'", 'system-ui', 'sans-serif']
			},
			colors: {
				primary: '#FF880C',
				accentOrange: '#F2994A',
				accentGray: '#4F4F4F',
				grayWeak: '#A7A7A7',
				grayWhite: '#F3F1F1',
				cream: { DEFAULT: '#FAF8F3', dark: '#F0ECE3' },
				earth: { DEFAULT: '#8B7355', light: '#A89070', dark: '#6B5740' },
				missionnaire: {
					DEFAULT: '#FF880C',
					50: '#FCF5ED',
					100: '#FFE5C9',
					200: '#FFD19F',
					300: '#FFBD75',
					400: '#FFA94B',
					500: '#FF880C',
					600: '#CC6A0A',
					700: '#994C08',
					800: '#663E06',
					900: '#332003'
				}
			},
			boxShadow: {
				'4xl': '0px 0px 14px 0px rgba(0, 0, 0, 0.04)'
			}
		}
	},
	plugins: []
};
