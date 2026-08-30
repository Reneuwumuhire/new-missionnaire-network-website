import { describe, expect, it } from 'vitest';
import {
	audioLayers,
	destinationPlatform,
	makeLayer,
	migrateDestination,
	persistableDestinations,
	reconnectWith,
	requiresYouTubeGoLive,
	stageableSettings,
	studio,
	uniqueById
} from './state.svelte';

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

describe('public destinations', () => {
	const youtube = {
		id: 'yt',
		name: 'YouTube',
		url: 'rtmp://a.rtmp.youtube.com/live2',
		key: 'key',
		enabled: true,
		hold: false
	};

	it('requires YouTube control only for an enabled public YouTube destination', () => {
		expect(requiresYouTubeGoLive([youtube])).toBe(true);
		expect(requiresYouTubeGoLive([{ ...youtube, enabled: false }])).toBe(false);
		expect(requiresYouTubeGoLive([youtube], true)).toBe(false);
	});

	it('keeps manual YouTube keys outside managed Go Live control', () => {
		const manual = { ...youtube, platform: 'youtube' as const, managed: false };
		expect(destinationPlatform(manual)).toBe('youtube');
		expect(requiresYouTubeGoLive([manual])).toBe(false);
	});

	it('never persists a managed ingest key', () => {
		const managed = { ...youtube, platform: 'youtube' as const, managed: true };
		expect(persistableDestinations([managed])[0]).toMatchObject({ key: '', enabled: false });
		expect(persistableDestinations([{ ...managed, managed: false }])[0].key).toBe('key');
	});

	it('preserves a legacy manual YouTube key during migration', () => {
		expect(migrateDestination(youtube)).toMatchObject({
			platform: 'youtube',
			managed: false,
			key: 'key',
			enabled: true
		});
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

describe('getting a lost source back', () => {
	it('sends a link to be resolved again, never to the file picker', () => {
		const link = makeLayer('video', 'song', { url: 'https://www.youtube.com/watch?v=x' });
		// The file picker would ask for something that was never on this machine.
		expect(reconnectWith(link)).toBe('link');
		expect(reconnectWith(makeLayer('video', 'clip'))).toBe('file');
		expect(reconnectWith(makeLayer('image', 'logo'))).toBe('file');
		expect(reconnectWith(makeLayer('camera', 'cam'))).toBe('camera');
		expect(reconnectWith(makeLayer('screen', 'win'))).toBe('screen');
	});
});
