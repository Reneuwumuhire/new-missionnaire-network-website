import { afterEach, expect, it, vi } from 'vitest';
import { Mixer } from './mixer';

afterEach(() => vi.unstubAllGlobals());

it('switches only local monitoring and keeps Program audio connected on failure', async () => {
	class Node {
		connections = new Set<unknown>();
		gain = { value: 0, setTargetAtTime: vi.fn() };
		offset = { value: 0 };
		connect(target: unknown) {
			this.connections.add(target);
		}
		disconnect(target?: unknown) {
			if (target) this.connections.delete(target);
			else this.connections.clear();
		}
		start() {}
		stop() {}
	}
	class Context {
		destination = new Node();
		gains: Node[] = [];
		streams: Node[] = [];
		createGain() {
			const node = new Node();
			this.gains.push(node);
			return node;
		}
		createMediaStreamDestination() {
			const node = Object.assign(new Node(), { stream: {} });
			this.streams.push(node);
			return node;
		}
		createConstantSource() {
			return new Node();
		}
		close() {
			return Promise.resolve();
		}
	}
	class Player {
		srcObject: unknown = null;
		setSinkId = vi.fn(async (_id: string) => {});
		play = vi.fn(async () => {});
		pause = vi.fn();
	}
	vi.stubGlobal('AudioContext', Context);
	vi.stubGlobal('Audio', Player);
	const mixer = new Mixer();
	const ctx = mixer.ctx as unknown as Context;
	const [master, monitor] = ctx.gains;
	const [program, selectedOutput, reference] = ctx.streams;
	const programConnections = [...master.connections];

	const player = (mixer as unknown as { monitorPlayer: Player }).monitorPlayer;
	player.setSinkId.mockRejectedValueOnce(new Error('Unavailable'));
	expect(await mixer.setMonitorOutput('missing')).toBe(false);
	expect(monitor.connections.has(ctx.destination)).toBe(true);
	expect(monitor.connections.has(selectedOutput)).toBe(false);

	expect(await mixer.setMonitorOutput('headphones')).toBe(true);
	expect(monitor.connections.has(ctx.destination)).toBe(false);
	expect(monitor.connections.has(selectedOutput)).toBe(true);
	expect(master.connections.has(program)).toBe(true);
	expect(master.connections.has(reference)).toBe(false);
	expect([...master.connections]).toEqual(programConnections);
	player.setSinkId.mockRejectedValueOnce(new Error('Unavailable'));
	expect(await mixer.setMonitorOutput('missing')).toBe(false);
	expect(player.setSinkId).toHaveBeenLastCalledWith('headphones');
	expect(monitor.connections.has(selectedOutput)).toBe(true);

	expect(await mixer.setMonitorOutput('')).toBe(true);
	expect(monitor.connections.has(ctx.destination)).toBe(true);
	expect(monitor.connections.has(selectedOutput)).toBe(false);
	await Promise.all([mixer.setMonitorOutput('headphones'), mixer.setMonitorOutput('')]);
	expect(monitor.connections.has(ctx.destination)).toBe(true);
	expect(monitor.connections.has(selectedOutput)).toBe(false);
	mixer.close();
});
