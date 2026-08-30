import { describe, expect, it } from 'vitest';
import { downloadPercent } from './updater.svelte';

describe('update download progress', () => {
	it('handles unknown sizes and clamps an overrun', () => {
		expect(downloadPercent(10, 0)).toBe(0);
		expect(downloadPercent(25, 100)).toBe(25);
		expect(downloadPercent(110, 100)).toBe(100);
	});
});
