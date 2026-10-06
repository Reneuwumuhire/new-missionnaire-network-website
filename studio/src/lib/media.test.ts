import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { handleFor, openNativeWindow, release } from './media.svelte';
import { makeLayer } from './state.svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetAllMocks();
});

it('keeps the newest window when an older capture starts late', async () => {
	const layer = makeLayer('screen', 'Live');
	const starts = new Map<number, (size: { width: number; height: number }) => void>();
	vi.mocked(invoke).mockImplementation((command, args) => {
		if (command === 'start_window_capture') {
			return new Promise((resolve) =>
				starts.set((args as { windowId: number }).windowId, resolve)
			) as never;
		}
		if (command === 'window_capture_frame') return new Promise(() => {}) as never;
		return Promise.resolve() as never;
	});
	vi.stubGlobal('HTMLVideoElement', class {});
	vi.stubGlobal('document', {
		createElement: () => ({ getContext: () => ({}) })
	});

	const oldOpen = openNativeWindow(layer, 1);
	const newOpen = openNativeWindow(layer, 2);
	starts.get(2)?.({ width: 640, height: 360 });
	const current = await newOpen;
	starts.get(1)?.({ width: 640, height: 360 });
	const stale = await oldOpen;
	const firstArgs = vi
		.mocked(invoke)
		.mock.calls.find(
			([command, args]) =>
				command === 'start_window_capture' && (args as { windowId: number }).windowId === 1
		)?.[1] as { id: string } | undefined;

	expect(handleFor(layer.id)).toBe(current);
	expect(stale.el).toBeNull();
	expect(firstArgs).toBeDefined();
	expect(
		vi
			.mocked(invoke)
			.mock.calls.some(
				([command, args]) =>
					command === 'stop_window_capture' && (args as { id: string }).id === firstArgs?.id
			)
	).toBe(true);
	release(layer.id);
});
