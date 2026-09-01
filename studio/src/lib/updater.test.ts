import { describe, expect, it } from 'vitest';
import { downloadPercent, retry } from './updater.svelte';

describe('update download progress', () => {
	it('handles unknown sizes and clamps an overrun', () => {
		expect(downloadPercent(10, 0)).toBe(0);
		expect(downloadPercent(25, 100)).toBe(25);
		expect(downloadPercent(110, 100)).toBe(100);
	});
});

describe('update checks', () => {
	it('retries transient failures without another button click', async () => {
		let attempts = 0;
		await expect(
			retry(async () => {
				if (++attempts < 3) throw new Error('temporary network failure');
				return '0.1.5';
			}, 0)
		).resolves.toBe('0.1.5');
		expect(attempts).toBe(3);
	});
});
