import { describe, expect, it } from 'vitest';
import { captureHasStalled, streamHealthIssue } from './stream-health';

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
});
