import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

const css = readFileSync(resolve('src/app.css'), 'utf8');
const palette = (selector: string) =>
	Object.fromEntries(
		[
			...css
				.match(new RegExp(`${selector.replace('.', '\\.')} \\{([^}]+)\\}`))![1]
				.matchAll(/--([\w-]+): (\d+) (\d+) (\d+);/g)
		].map(([, key, ...rgb]) => [key, rgb.map(Number)])
	);
const base = palette(':root');
const themes = {
	dark: base,
	light: { ...base, ...palette(':root.light') },
	midnight: { ...base, ...palette(':root.midnight') }
};
const blend = (fg: number[], bg: number[], alpha: number) =>
	fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));
const luminance = (rgb: number[]) =>
	rgb
		.map((v) => v / 255)
		.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
		.reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a: number[], b: number[]) => {
	const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (values[0] + 0.05) / (values[1] + 0.05);
};

it('keeps normal text at 4.5:1 on Studio panels and status surfaces in every theme', () => {
	const tints = [
		[16, 185, 129],
		[245, 158, 11],
		[239, 68, 68],
		[255, 136, 12]
	];
	for (const [name, theme] of Object.entries(themes)) {
		for (const surface of ['ink-950', 'ink-900', 'ink-850', 'ink-800']) {
			const backgrounds = [
				theme[surface],
				...tints.map((tint) => blend(tint, theme[surface], 0.2))
			];
			for (const background of backgrounds) {
				for (const alpha of [0.7, 0.75, 0.8, 0.85, 0.9]) {
					expect(
						contrast(blend(theme.fg, background, alpha), background),
						`${name}: fg/${alpha} on ${surface}`
					).toBeGreaterThanOrEqual(4.5);
				}
				for (const ink of [
					'fg',
					'text-muted',
					'text-success',
					'text-warning',
					'text-danger',
					'text-accent'
				]) {
					expect(
						contrast(theme[ink], background),
						`${name}: ${ink} on ${surface} / ${background}`
					).toBeGreaterThanOrEqual(4.5);
				}
			}
		}
	}
});

it('keeps input boundaries and keyboard focus at 3:1 in every theme', () => {
	for (const [name, theme] of Object.entries(themes)) {
		for (const surface of ['ink-950', 'ink-900', 'ink-850', 'ink-800']) {
			for (const ink of ['control-border', 'text-accent']) {
				expect(
					contrast(theme[ink], theme[surface]),
					`${name}: ${ink} / ${surface}`
				).toBeGreaterThanOrEqual(3);
			}
		}
	}
});

it('does not reintroduce tiny interface text or dark-only status ink', () => {
	for (const file of readdirSync(resolve('src'), { recursive: true }).filter((file) =>
		String(file).endsWith('.svelte')
	)) {
		const source = readFileSync(resolve('src', String(file)), 'utf8');
		expect(source, String(file)).not.toMatch(/text-\[(?:[6-9]|10|11)px\]/);
		expect(source, String(file)).not.toMatch(/text-(?:emerald|amber|red)-\d/);
	}
});

// Solid badges cannot inherit the theme's foreground (black in Light).
it('keeps selected scene numbers and solid action badges readable', () => {
	expect(contrast(blend([0, 0, 0], [255, 136, 12], 0.8), [255, 136, 12])).toBeGreaterThanOrEqual(
		4.5
	);
	for (const background of [
		[220, 38, 38],
		[185, 28, 28],
		[29, 78, 216],
		[30, 64, 175]
	]) {
		expect(contrast([255, 255, 255], background)).toBeGreaterThanOrEqual(4.5);
	}
});
