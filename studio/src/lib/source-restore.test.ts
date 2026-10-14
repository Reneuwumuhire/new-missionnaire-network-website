import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { handleFor, openLocalMedia, openNativeWindow, openStream } from './media.svelte';
import { makeLayer, studio } from './state.svelte';
import { restoreSavedSources, savedWindowMatch } from './source-restore';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('./media.svelte', () => ({
	handleFor: vi.fn(),
	openLocalMedia: vi.fn(),
	openNativeWindow: vi.fn(),
	openStream: vi.fn(),
	release: vi.fn(),
	report: vi.fn()
}));

const originalScenes = studio.scenes;
afterEach(() => {
	studio.scenes = originalScenes;
	vi.resetAllMocks();
});

it('matches a saved window by app and title when its OS id changes', () => {
	const layer = makeLayer('screen', 'Krefeld', {
		windowId: 1,
		appId: 'org.browser',
		windowTitle: 'Krefeld'
	});
	const windows = [
		{ id: 2, appId: 'org.browser', appName: 'Browser', title: 'Other', width: 10, height: 10 },
		{ id: 3, appId: 'org.browser', appName: 'Browser', title: 'Krefeld', width: 10, height: 10 }
	];
	expect(savedWindowMatch(layer, windows)?.id).toBe(3);
	expect(savedWindowMatch(layer, [...windows, { ...windows[1], id: 4 }])).toBeUndefined();
});

it('restores saved local files, native windows and links on launch', async () => {
	const file = makeLayer('image', 'Thumbnail', { filePath: '/media/thumbnail.png' });
	const window = makeLayer('screen', 'Krefeld', {
		windowId: 1,
		appId: 'org.browser',
		windowTitle: 'Krefeld'
	});
	const link = makeLayer('video', 'Sermon', { url: 'https://example.com/watch' });
	studio.scenes = [{ id: 'scene', name: 'Scene', layers: [file, window, link] }];
	vi.mocked(invoke).mockImplementation((command) => {
		if (command === 'native_window_capture_available') return Promise.resolve(true) as never;
		if (command === 'list_windows')
			return Promise.resolve([
				{ id: 3, appId: 'org.browser', appName: 'Browser', title: 'Krefeld', width: 10, height: 10 }
			]) as never;
		if (command === 'register_local_media') return Promise.resolve({ token: 'local' }) as never;
		if (command === 'resolve_media')
			return Promise.resolve({ token: 'remote', duration: 42 }) as never;
		return Promise.resolve() as never;
	});
	vi.mocked(openNativeWindow).mockResolvedValue({ el: {} } as never);
	await restoreSavedSources();
	expect(openLocalMedia).toHaveBeenCalledWith(file, 'local');
	expect(openNativeWindow).toHaveBeenCalledWith(window, 3);
	expect(window.windowId).toBe(3);
	expect(openStream).toHaveBeenCalledWith(link, 'remote');
	expect(link.duration).toBe(42);
	expect(handleFor).toHaveBeenCalledWith(file.id);
});
