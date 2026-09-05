import { afterEach, expect, it, vi } from 'vitest';
import { watchDevices } from './media.svelte';

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

it('discovers devices after focus or missed events and cleans up listeners', async () => {
	vi.useFakeTimers();
	const mediaDevices = new EventTarget();
	const window = new EventTarget();
	const document = Object.assign(new EventTarget(), { hidden: false });
	vi.stubGlobal('navigator', { mediaDevices });
	vi.stubGlobal('window', window);
	vi.stubGlobal('document', document);
	const refresh = vi.fn(async () => {});
	const stop = watchDevices(refresh);
	await Promise.resolve();
	expect(refresh).toHaveBeenCalledTimes(1);
	mediaDevices.dispatchEvent(new Event('devicechange'));
	await Promise.resolve();
	window.dispatchEvent(new Event('focus'));
	await Promise.resolve();
	await vi.advanceTimersByTimeAsync(3000);
	expect(refresh).toHaveBeenCalledTimes(4);
	document.hidden = true;
	await vi.advanceTimersByTimeAsync(3000);
	expect(refresh).toHaveBeenCalledTimes(4);
	stop();
	document.hidden = false;
	window.dispatchEvent(new Event('focus'));
	await vi.advanceTimersByTimeAsync(3000);
	expect(refresh).toHaveBeenCalledTimes(4);
});
