import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	programBlackOpacity,
	renderFrame,
	selectScene,
	setStudioMode,
	snapshotForProgram,
	takeToProgram,
	toggleProgramBlack,
	transitionPlan
} from './compositor';
import { mediaHandleKey } from './media.svelte';
import { makeLayer, programScene, studio, transportLayer } from './state.svelte';

describe('transitionPlan', () => {
	it('fades between two different scenes', () => {
		expect(transitionPlan('a', 'b', 'fade', 350)).toEqual({
			fromSceneId: 'a',
			durationMs: 350,
			type: 'fade'
		});
	});

	it('cuts when the type is Cut, whatever duration is remembered', () => {
		// The duration is kept so switching back to Fade restores it; it must
		// not leak into a Cut.
		expect(transitionPlan('a', 'b', 'cut', 350)).toBeNull();
	});

	it('never fades a scene into itself', () => {
		expect(transitionPlan('a', 'a', 'fade', 350)).toBeNull();
	});

	it('treats a zero duration as a cut', () => {
		expect(transitionPlan('a', 'b', 'fade', 0)).toBeNull();
	});
});

describe('putting a scene on air', () => {
	beforeEach(() => {
		studio.settings.studioMode = false;
		studio.settings.transitionType = 'fade';
		studio.settings.transitionMs = 350;
		studio.activeSceneId = studio.scenes[0].id;
		studio.programSceneId = studio.scenes[0].id;
	});

	it('fades from the scene that was on air when clicking a scene', () => {
		// Regression: selectScene used to move the edit selection first, so the
		// transition compared the new scene against itself and always cut.
		const [first, second] = studio.scenes;
		selectScene(second.id);
		expect(studio.programSceneId).toBe(second.id);
		expect(studio.activeSceneId).toBe(second.id);

		studio.activeSceneId = first.id;
		studio.programSceneId = first.id;
		const plan = takeToProgram(second.id, 350, first.id);
		expect(plan).toEqual({ fromSceneId: first.id, durationMs: 350, type: 'fade' });
	});

	it('reports the cut it made so callers are not guessing', () => {
		const [first, second] = studio.scenes;
		studio.settings.transitionType = 'cut';
		expect(takeToProgram(second.id, 350, first.id)).toBeNull();
		// The scene still goes on air — a cut is a transition, just an instant one.
		expect(studio.programSceneId).toBe(second.id);
	});

	it.each(['cut', 'fade', 'fadeToBlack'] as const)(
		'holds black and lets %s reveal the picture',
		(type) => {
			let now = 100;
			const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
			const [first, second] = studio.scenes;
			const fillRect = vi.fn();
			const ctx = {
				canvas: { width: 320, height: 180 },
				save: vi.fn(),
				restore: vi.fn(),
				fillRect
			};
			try {
				takeToProgram(second.id, 400, first.id, 'fadeToBlack');
				expect(studio.programSceneId).toBe(first.id);
				expect(studio.settings.transitionType).toBe('fade');
				now += 200;
				expect(programBlackOpacity()).toBe(0.5);
				now += 10_000;
				expect(programBlackOpacity()).toBe(1);
				renderFrame(ctx as unknown as CanvasRenderingContext2D, first.id, true);
				expect(fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, 320, 180);
				expect(studio.programBlack).toBe(true);

				takeToProgram(second.id, 400, first.id, type);
				expect(studio.programBlack).toBe(false);
				expect(studio.programSceneId).toBe(type === 'fadeToBlack' ? first.id : second.id);
				now += 200;
				expect(programBlackOpacity()).toBe(type === 'cut' ? 0 : 0.5);
				now += 200;
				expect(programBlackOpacity()).toBe(0);
			} finally {
				if (!studio.programBlack) toggleProgramBlack(0);
				toggleProgramBlack(0);
				clock.mockRestore();
			}
		}
	);

	it('cuts instantly when a caller asks for zero, e.g. deleting the live scene', () => {
		const [first, second] = studio.scenes;
		expect(takeToProgram(second.id, 0, first.id)).toBeNull();
		expect(studio.programSceneId).toBe(second.id);
	});

	it('leaves the program scene alone in Studio Mode until it is taken', () => {
		const [first, second] = studio.scenes;
		setStudioMode(true);
		selectScene(second.id);
		expect(studio.activeSceneId).toBe(second.id);
		expect(studio.programSceneId).toBe(first.id);

		const plan = takeToProgram(second.id);
		expect(plan).toEqual({ fromSceneId: first.id, durationMs: 350, type: 'fade' });
		expect(studio.programSceneId).toBe(second.id);
	});

	it('keeps the preview scene recording available after changing scenes and returning', () => {
		const [first, second] = studio.scenes;
		const previousLayers = second.layers;
		const recording = makeLayer('video', 'Music');
		try {
			second.layers = [recording, ...previousLayers];
			setStudioMode(true);
			selectScene(second.id);
			expect(transportLayer()?.id).toBe(recording.id);
			selectScene(first.id);
			selectScene(second.id);
			expect(transportLayer()?.id).toBe(recording.id);
		} finally {
			second.layers = previousLayers;
		}
	});

	it('stages edits to the current scene until Transition is pressed', () => {
		const first = studio.scenes[0];
		setStudioMode(true);
		const onAirX = programScene().layers[0].rect.x;
		first.layers[0].rect.x = onAirX + 0.1;

		expect(programScene().layers[0].rect.x).toBe(onAirX);
		expect(takeToProgram(first.id)).not.toBeNull();
		expect(programScene().layers[0].rect.x).toBe(onAirX + 0.1);
	});

	it('pins the exact media generation without changing the Preview layer', () => {
		const scene = studio.scenes[0];
		const media = scene.layers.find((layer) =>
			['camera', 'screen', 'image', 'video'].includes(layer.kind)
		);
		if (!media) throw new Error('fixture needs a media layer');

		const snapshot = snapshotForProgram(scene, (id) => `${id}:on-air`);
		expect(snapshot.layers.find(({ id }) => id === media.id)?.mediaHandleId).toBe(
			`${media.id}:on-air`
		);
		expect(media.mediaHandleId).toBeUndefined();
	});

	it('keeps a disconnected Program source disconnected until it is taken again', () => {
		const scene = studio.scenes[0];
		const media = scene.layers.find((layer) =>
			['camera', 'screen', 'image', 'video'].includes(layer.kind)
		);
		if (!media) throw new Error('fixture needs a media layer');

		const snapshot = snapshotForProgram(scene, () => undefined);
		const onAirMedia = snapshot.layers.find(({ id }) => id === media.id);
		expect(onAirMedia?.mediaHandleId).toBeNull();
		expect(mediaHandleKey(onAirMedia!)).toBeNull();
	});
});
