import { invoke } from '@tauri-apps/api/core';
import {
	handleFor,
	openLocalMedia,
	openNativeWindow,
	openStream,
	release,
	report
} from './media.svelte';
import { persist, studio, type Layer } from './state.svelte';
import type { AudioWindow } from './appaudio.svelte';

export function savedWindowMatch(layer: Layer, windows: AudioWindow[]): AudioWindow | undefined {
	const byId = windows.find(
		(window) => window.id === layer.windowId && window.appId === layer.appId
	);
	if (byId?.id !== undefined) return byId;
	if (!layer.appId || !layer.windowTitle) return undefined;
	const matches = windows.filter(
		(window) => window.appId === layer.appId && window.title === layer.windowTitle
	);
	return matches.length === 1 && matches[0].id !== undefined ? matches[0] : undefined;
}

function stillSaved(layer: Layer): boolean {
	return studio.scenes.some((scene) => scene.layers.some((candidate) => candidate.id === layer.id));
}

/** Reopen persisted media after setup. Native window and display IDs can be
 * reused while their capture target is still present. */
export async function restoreSavedSources(): Promise<void> {
	const layers = studio.scenes.flatMap((scene) => scene.layers);
	let windows: AudioWindow[] = [];
	let displays: { id: number }[] = [];
	if (layers.some((layer) => layer.kind === 'screen' && layer.windowId)) {
		try {
			if (await invoke<boolean>('native_window_capture_available')) {
				windows = await invoke<AudioWindow[]>('list_windows');
			}
		} catch (error) {
			report(`list saved windows failed: ${error}`);
		}
	}
	if (layers.some((layer) => layer.kind === 'screen' && layer.displayId)) {
		try {
			displays = await invoke<{ id: number }[]>('list_displays', { preview: false });
		} catch (error) {
			report(`list saved displays failed: ${error}`);
		}
	}
	await Promise.all(
		layers.map(async (layer) => {
			try {
				if (layer.kind === 'screen' && layer.displayId) {
					if (!displays.some((display) => display.id === layer.displayId)) return;
					if (!stillSaved(layer) || handleFor(layer.id)) return;
					await openNativeWindow(layer, 0, layer.displayId);
					if (!stillSaved(layer)) release(layer.id);
				} else if (layer.kind === 'screen' && layer.windowId) {
					const window = savedWindowMatch(layer, windows);
					if (window?.id === undefined) return;
					if (!stillSaved(layer) || handleFor(layer.id)) return;
					const handle = await openNativeWindow(layer, window.id);
					if (!stillSaved(layer)) {
						release(layer.id);
						return;
					}
					if (handle.el) {
						layer.windowId = window.id;
						layer.windowTitle = window.title;
						persist();
						report(`restored window source ${layer.name}`);
					}
				} else if ((layer.kind === 'image' || layer.kind === 'video') && layer.filePath) {
					const saved = await invoke<{ token: string }>('register_local_media', {
						path: layer.filePath
					});
					if (stillSaved(layer) && !handleFor(layer.id)) {
						openLocalMedia(layer, saved.token);
						report(`restored local source ${layer.name}`);
					}
				} else if (layer.kind === 'video' && layer.url) {
					const found = await invoke<{ token: string; duration: number }>('resolve_media', {
						url: layer.url,
						audioOnly: Boolean(layer.audioOnly)
					});
					if (stillSaved(layer) && !handleFor(layer.id)) {
						layer.duration = found.duration;
						openStream(layer, found.token);
						persist();
						report(`restored linked source ${layer.name}`);
					}
				}
			} catch (error) {
				report(`restore source ${layer.name} failed: ${error}`);
			}
		})
	);
}
