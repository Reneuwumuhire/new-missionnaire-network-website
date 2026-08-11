import { describe, expect, it } from 'vitest';
import { audioLayers, makeLayer, studio } from './state.svelte';

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
