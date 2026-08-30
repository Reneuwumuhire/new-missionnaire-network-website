import { beforeEach, describe, expect, it } from 'vitest';
import {
	outputAlignedPositionMs,
	sampleOutputClock,
	sampleServerClock,
	serverEpochMs,
	startStreamClock,
	stopStreamClock
} from './stream-clock';

describe('stream clock', () => {
	beforeEach(() => stopStreamClock());

	it('subtracts encoder backlog from the subtitle position', () => {
		startStreamClock(10_000);
		sampleOutputClock(3_500, 15_000);
		expect(outputAlignedPositionMs(20_000, 15_100)).toBe(18_500);
	});

	it('uses the local position until ffmpeg has a fresh timing sample', () => {
		startStreamClock(10_000);
		expect(outputAlignedPositionMs(1200, 11_000)).toBe(1200);
		sampleOutputClock(500, 11_000);
		expect(outputAlignedPositionMs(1200, 14_000)).toBe(1200);
	});

	it('corrects Studio clock skew from the request midpoint', () => {
		sampleServerClock(21_040, 21_060, 10_000, 10_100);
		expect(serverEpochMs(12_000)).toBe(23_000);
	});
});
