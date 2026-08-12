import { describe, expect, it } from 'vitest';
import { audioLayers, makeLayer, stageableSettings, studio, uniqueById } from './state.svelte';

describe('which layers get a mixer strip', () => {
	const window = makeLayer('screen', 'Arc', { appId: 'company.thebrowser.Browser' });
	const camera = makeLayer('camera', 'Camera');

	function scenes() {
		studio.scenes = [
			{ id: 'a', name: 'A', layers: [window, camera] },
			{ id: 'b', name: 'B', layers: [] }
		];
		// Scene B is on air: it has no audio of its own.
		studio.activeSceneId = 'b';
		studio.programSceneId = 'b';
		studio.settings.studioMode = false;
	}

	it('carries a window capturing an application into a scene without audio', () => {
		scenes();
		window.visible = true;
		const ids = audioLayers().map((l) => l.id);
		expect(ids).toContain(window.id);
		// The camera's sound is the scene's, and stops with it.
		expect(ids).not.toContain(camera.id);
	});

	it('still answers to the eye icon', () => {
		scenes();
		window.visible = false;
		expect(audioLayers().map((l) => l.id)).not.toContain(window.id);
	});
});

describe('a saved file that would take the app down', () => {
	it('keeps the first of each duplicated id, and drops the malformed', () => {
		// Svelte's keyed blocks throw on a duplicate key, and a throw during
		// render is a black window with nothing on the terminal — which is what
		// a self-test leaving its probe sources behind actually produced.
		const kept = uniqueById([
			{ id: 'mic', name: 'a' },
			{ id: 'mic', name: 'b' },
			{ name: 'no id' },
			{ id: 'app', name: 'c' }
		] as { id?: string; name: string }[]);
		expect(kept.map((item) => item.name)).toEqual(['a', 'c']);
	});
});

describe('what the settings dialog stages', () => {
	it('carries every setting except the layout', () => {
		// The splitters write the layout from outside the dialog; applying a copy
		// taken when it opened would undo whatever was dragged in the meantime.
		const staged = stageableSettings(studio.settings);
		expect(staged).not.toHaveProperty('layout');
		expect(staged.fps).toBe(studio.settings.fps);
		expect(staged.encoder).toBe(studio.settings.encoder);
	});
});
