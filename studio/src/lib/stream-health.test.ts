import { describe, expect, it } from 'vitest';
import { captureHasStalled, retryRecovery, streamHealthIssue } from './stream-health';

describe('stream health', () => {
	it('detects a silent MediaRecorder even when it still claims to be recording', () => {
		expect(captureHasStalled('recording', 1_000, 5_000, 4_000)).toBe(true);
		expect(captureHasStalled('recording', 1_001, 5_000, 4_000)).toBe(false);
		expect(captureHasStalled('inactive', 5_000, 5_000, 4_000)).toBe(true);
	});

	it('does not blame the uplink for a capture or encoder stall', () => {
		const slow = { backpressure_events: 0, dropped_frames: 0, speed: 0.12 };
		expect(streamHealthIssue(slow, 'recovering')).toBe('capture');
		expect(streamHealthIssue(slow, 'healthy')).toBe('encoder');
		expect(streamHealthIssue({ ...slow, backpressure_events: 1 }, 'healthy')).toBe('pipeline');
	});

	it('retries immediately before applying bounded backoff', async () => {
		let attempts = 0;
		const waits: number[] = [];
		const result = await retryRecovery(
			async () => {
				attempts++;
				if (attempts < 3) throw new Error('offline');
				return 'connected';
			},
			() => true,
			async (delay) => void waits.push(delay)
		);
		expect(result).toBe('connected');
		expect(attempts).toBe(3);
		expect(waits).toEqual([1_000, 3_000]);
	});

	it('cancels a pending recovery without another attempt', async () => {
		let current = true;
		let attempts = 0;
		const result = await retryRecovery(
			async () => {
				attempts++;
				throw new Error('offline');
			},
			() => current,
			async () => {
				current = false;
			}
		);
		expect(result).toBeNull();
		expect(attempts).toBe(1);
	});

	it('stops after the bounded recovery attempts are exhausted', async () => {
		let attempts = 0;
		await expect(
			retryRecovery(
				async () => {
					attempts++;
					throw new Error('still offline');
				},
				() => true,
				async () => undefined
			)
		).rejects.toThrow('still offline');
		expect(attempts).toBe(3);
	});
});
