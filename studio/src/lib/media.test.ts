import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
	askForMicrophone,
	handleFor,
	mediaVersion,
	openFile,
	openLocalMedia,
	openNativeWindow,
	openScreen,
	pinHandle,
	permissions,
	previewAudioLayer,
	release,
	releaseUnusedPins
} from './media.svelte';
import { makeLayer, studio } from './state.svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetAllMocks();
});

it('only calls a microphone failure a permission denial when access is refused', async () => {
	const getUserMedia = vi.fn();
	vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
	getUserMedia.mockRejectedValueOnce(new DOMException('Missing', 'NotFoundError'));
	await askForMicrophone();
	expect(permissions.microphone).toBe('unknown');
	getUserMedia.mockRejectedValueOnce(new DOMException('Refused', 'NotAllowedError'));
	await askForMicrophone();
	expect(permissions.microphone).toBe('denied');
	expect(permissions.message).toContain('Microphone');
	getUserMedia.mockResolvedValueOnce({ getTracks: () => [{ stop: vi.fn() }] });
	await askForMicrophone();
	expect(permissions.microphone).toBe('granted');
	expect(permissions.message).toBe('');
});

it('marks a shared display disconnected when the user stops Windows screen sharing', async () => {
	class Video {
		srcObject: unknown;
		muted = false;
		playsInline = false;
		autoplay = false;
		play() {
			return Promise.resolve();
		}
		pause() {}
		removeAttribute() {}
	}
	const track = Object.assign(new EventTarget(), {
		stop: vi.fn(),
		applyConstraints: vi.fn().mockResolvedValue(undefined)
	});
	const stream = {
		getVideoTracks: () => [track],
		getTracks: () => [track]
	};
	vi.stubGlobal('HTMLVideoElement', Video);
	vi.stubGlobal('document', { createElement: () => new Video() });
	const getDisplayMedia = vi.fn().mockResolvedValue(stream);
	vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia } });
	const layer = makeLayer('screen', 'Display');
	await openScreen(layer);
	expect(getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: true });
	expect(handleFor(layer.id)?.el).toBeInstanceOf(Video);
	track.dispatchEvent(new Event('ended'));
	expect(handleFor(layer.id)).toBeUndefined();
});

it('loads a selected Windows image through WebView2’s custom protocol origin', () => {
	class ImageElement {
		crossOrigin = '';
		src = '';
		onerror: (() => void) | null = null;
		onload: (() => void) | null = null;
	}
	vi.stubGlobal('navigator', { userAgent: 'Windows NT 10.0' });
	vi.stubGlobal('Image', ImageElement);
	vi.stubGlobal('HTMLVideoElement', class {});
	const layer = makeLayer('image', 'Photo');
	try {
		const handle = openLocalMedia(layer, 'l42');
		expect((handle.el as unknown as ImageElement).src).toBe(
			'http://localmedia.localhost/media?id=l42'
		);
		expect((handle.el as unknown as ImageElement).crossOrigin).toBe('anonymous');
	} finally {
		release(layer.id);
	}
});

it('auditions a disconnected Preview file but stops auditioning once Program takes it', () => {
	class Video {
		muted = true;
		src = '';
		pause() {}
		removeAttribute() {}
	}
	vi.stubGlobal('HTMLVideoElement', Video);
	vi.stubGlobal('document', { createElement: () => new Video() });
	const original = {
		scenes: studio.scenes,
		activeSceneId: studio.activeSceneId,
		programSceneId: studio.programSceneId,
		programSceneSnapshot: studio.programSceneSnapshot,
		selectedLayerId: studio.selectedLayerId,
		studioMode: studio.settings.studioMode
	};
	const layer = makeLayer('video', 'Music');
	const scene = { id: 'preview', name: 'Preview', layers: [layer] };
	try {
		studio.scenes = [scene];
		studio.activeSceneId = studio.programSceneId = scene.id;
		studio.programSceneSnapshot = {
			...scene,
			layers: [{ ...layer, mediaHandleId: null }]
		};
		studio.selectedLayerId = layer.id;
		studio.settings.studioMode = true;
		openFile(layer, new Blob());
		expect(previewAudioLayer()?.id).toBe(layer.id);
		studio.selectedLayerId = null;
		expect(previewAudioLayer()?.id).toBe(layer.id);

		studio.programSceneSnapshot.layers[0].mediaHandleId = pinHandle(layer.id);
		expect(previewAudioLayer()).toBeNull();
	} finally {
		release(layer.id);
		releaseUnusedPins([]);
		studio.scenes = original.scenes;
		studio.activeSceneId = original.activeSceneId;
		studio.programSceneId = original.programSceneId;
		studio.programSceneSnapshot = original.programSceneSnapshot;
		studio.selectedLayerId = original.selectedLayerId;
		studio.settings.studioMode = original.studioMode;
	}
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
