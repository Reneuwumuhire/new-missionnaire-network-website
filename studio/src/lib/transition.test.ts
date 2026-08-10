import { beforeEach, describe, expect, it } from 'vitest';
import { selectScene, takeToProgram, transitionPlan } from './compositor';
import { studio } from './state.svelte';

describe('transitionPlan', () => {
	it('fades between two different scenes', () => {
		expect(transitionPlan('a', 'b', 'fade', 350)).toEqual({ fromSceneId: 'a', durationMs: 350 });
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
		expect(plan).toEqual({ fromSceneId: first.id, durationMs: 350 });
	});

	it('reports the cut it made so callers are not guessing', () => {
		const [first, second] = studio.scenes;
		studio.settings.transitionType = 'cut';
		expect(takeToProgram(second.id, 350, first.id)).toBeNull();
		// The scene still goes on air — a cut is a transition, just an instant one.
		expect(studio.programSceneId).toBe(second.id);
	});

	it('cuts instantly when a caller asks for zero, e.g. deleting the live scene', () => {
		const [first, second] = studio.scenes;
		expect(takeToProgram(second.id, 0, first.id)).toBeNull();
		expect(studio.programSceneId).toBe(second.id);
	});

	it('leaves the program scene alone in Studio Mode until it is taken', () => {
		const [first, second] = studio.scenes;
		studio.settings.studioMode = true;
		selectScene(second.id);
		expect(studio.activeSceneId).toBe(second.id);
		expect(studio.programSceneId).toBe(first.id);

		const plan = takeToProgram(second.id);
		expect(plan).toEqual({ fromSceneId: first.id, durationMs: 350 });
		expect(studio.programSceneId).toBe(second.id);
	});
});
