const plugin = require('tailwindcss/plugin');

module.exports = plugin(function ({ addBase, theme }) {
	addBase({
		':root': {
			'--scrollbar-width': '12px',
			'--scrollbar-height': '12px',
			'--scrollbar-track-color': theme('colors.gray.200', '#f1f1f1'),
			'--scrollbar-thumb-color': theme('colors.orange.500', '#ff9800'),
			'--scrollbar-thumb-hover-color': theme('colors.orange.600', '#e68a00')
		},
		// Webkit browsers (Chrome, Safari, newer versions of Edge)
		'::-webkit-scrollbar': {
			width: 'var(--scrollbar-width)',
			height: 'var(--scrollbar-height)'
		},
		'::-webkit-scrollbar-track': {
			background: 'var(--scrollbar-track-color)'
		},
		'::-webkit-scrollbar-thumb': {
			background: 'var(--scrollbar-thumb-color)',
			borderRadius: '6px'
		},
		'::-webkit-scrollbar-thumb:hover': {
			background: 'var(--scrollbar-thumb-hover-color)'
		},
		// Firefox
		html: {
			scrollbarWidth: 'thin',
			scrollbarColor: 'var(--scrollbar-thumb-color) var(--scrollbar-track-color)'
		}
	});
});
