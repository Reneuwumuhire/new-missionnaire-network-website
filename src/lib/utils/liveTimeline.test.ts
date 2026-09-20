import { describe, expect, it } from 'vitest';
import { getLiveTimeline } from './liveTimeline';

describe('live timeline', () => {
	const live = { start: 0, end: 300, position: 280, syncPosition: 282, playing: true };
	it('pins normal live playback to the far right without changing the media clock', () => {
		const timeline = getLiveTimeline(live);
		expect(timeline).toMatchObject({ atEdge: true, value: 282, edge: 282, fill: 100 });
		expect(live.position).toBe(280);
	});
	it('uses the native HLS safety latency when no hls.js sync position is available', () => {
		expect(getLiveTimeline({ ...live, syncPosition: null }).fill).toBe(100);
	});
	it('uses the actual HLS sync target even with a different segment duration', () => {
		expect(getLiveTimeline({ ...live, position: 268, syncPosition: 270 }).fill).toBe(100);
	});
	it('leaves paused playback behind as the live window advances', () => {
		const paused = getLiveTimeline({ ...live, playing: false });
		const later = getLiveTimeline({
			...live,
			start: 30,
			end: 330,
			syncPosition: 312,
			playing: false
		});
		expect(paused.atEdge).toBe(false);
		expect(paused.value).toBe(280);
		expect(later.value).toBe(280);
		expect(later.behind).toBe(32);
		expect(later.fill).toBeLessThan(paused.fill);
	});
	it('does not label a deliberate short rewind as live', () => {
		expect(getLiveTimeline({ ...live, rewound: true })).toMatchObject({
			atEdge: false,
			value: 280
		});
	});
	it('shows a longer rewind and returns to 100% after jump-to-live', () => {
		expect(getLiveTimeline({ ...live, position: 180 })).toMatchObject({
			atEdge: false,
			behind: 102
		});
		expect(getLiveTimeline({ ...live, position: 282, rewound: false }).fill).toBe(100);
	});
	it('clamps an expired paused position to the sliding window, not outside the control', () => {
		expect(
			getLiveTimeline({ ...live, start: 290, end: 600, syncPosition: 582, playing: false })
		).toMatchObject({ value: 290, fill: 0, atEdge: false });
	});
	it('keeps empty/short windows finite', () => {
		expect(getLiveTimeline({ start: 0, end: 0, position: 0, playing: false }).fill).toBe(0);
		expect(getLiveTimeline({ start: 100, end: 105, position: 0, playing: false }).edge).toBe(100);
	});
});
