import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { handleFor, mediaVersion, openNativeWindow, release } from './media.svelte';
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

it('backs off repeated window frame errors without refreshing the UI again', async () => {
	vi.useFakeTimers();
	const layer = makeLayer('screen', 'Live');
	vi.mocked(invoke).mockImplementation((command) => {
		if (command === 'start_window_capture')
			return Promise.resolve({ width: 640, height: 360 }) as never;
		if (command === 'window_capture_frame')
			return Promise.reject(new Error('frame unavailable')) as never;
		return Promise.resolve() as never;
	});
	vi.stubGlobal('HTMLVideoElement', class {});
	vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({}) }) });

	try {
		await openNativeWindow(layer, 1);
		await vi.advanceTimersByTimeAsync(0);
		const versionAfterFirstError = mediaVersion.n;
		expect(handleFor(layer.id)?.error).toContain('frame unavailable');

		await vi.advanceTimersByTimeAsync(250);
		expect(mediaVersion.n).toBe(versionAfterFirstError);
		expect(
			vi.mocked(invoke).mock.calls.filter(([command]) => command === 'window_capture_frame')
		).toHaveLength(2);

		await vi.advanceTimersByTimeAsync(499);
		expect(
			vi.mocked(invoke).mock.calls.filter(([command]) => command === 'window_capture_frame')
		).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(1);
		expect(
			vi.mocked(invoke).mock.calls.filter(([command]) => command === 'window_capture_frame')
		).toHaveLength(3);
		expect(mediaVersion.n).toBe(versionAfterFirstError);
	} finally {
		release(layer.id);
		vi.useRealTimers();
	}
});

it('closes a decoded window frame when drawing fails', async () => {
	vi.useFakeTimers();
	const layer = makeLayer('screen', 'Live');
	const close = vi.fn();
	const frame = new ArrayBuffer(9);
	new DataView(frame).setBigUint64(0, 1n, true);
	vi.mocked(invoke).mockImplementation((command) => {
		if (command === 'start_window_capture')
			return Promise.resolve({ width: 640, height: 360 }) as never;
		if (command === 'window_capture_frame') return Promise.resolve(frame) as never;
		return Promise.resolve() as never;
	});
	vi.stubGlobal('HTMLVideoElement', class {});
	vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ close }));
	vi.stubGlobal('document', {
		createElement: () => ({
			getContext: () => ({
				drawImage: () => {
					throw new Error('draw failed');
				}
			})
		})
	});

	try {
		await openNativeWindow(layer, 1);
		await vi.advanceTimersByTimeAsync(0);
		expect(close).toHaveBeenCalledOnce();
		expect(handleFor(layer.id)?.error).toContain('draw failed');
	} finally {
		release(layer.id);
		vi.useRealTimers();
	}
});
