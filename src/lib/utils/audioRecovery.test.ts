import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlaybackStallDetector, reloadAudio } from './audioRecovery';

describe('playback stall detection', () => {
	it('leaves uninterrupted playback and brief buffering alone', () => {
		const check = createPlaybackStallDetector();
		for (let now = 0; now <= 60_000; now += 3000) {
			expect(check({ src: 'song', time: now / 1000, now, active: true })).toBe(false);
		}
		for (let now = 63_000; now <= 72_000; now += 3000) {
			expect(check({ src: 'song', time: 60, now, active: true })).toBe(false);
		}
	});

	it('recovers sustained stalls at most twice until playback advances', () => {
		const check = createPlaybackStallDetector();
		const recoveries: number[] = [];
		for (let now = 0; now <= 90_000; now += 3000) {
			if (check({ src: 'song', time: 25, now, active: true })) recoveries.push(now);
		}
		expect(recoveries).toEqual([15_000, 30_000]);
		check({ src: 'song', time: 28, now: 93_000, active: true });
		for (let now = 96_000; now < 108_000; now += 3000) {
			expect(check({ src: 'song', time: 28, now, active: true })).toBe(false);
		}
		expect(check({ src: 'song', time: 28, now: 108_000, active: true })).toBe(true);
	});

	it('does not mistake a suspended timer for a stall', () => {
		const check = createPlaybackStallDetector();
		check({ src: 'song', time: 20, now: 0, active: true });
		expect(check({ src: 'song', time: 20, now: 180_000, active: true })).toBe(false);
		expect(check({ src: 'song', time: 23, now: 183_000, active: true })).toBe(false);
	});

	it('ignores deliberate pauses, seeks, live mode, offline and reloads (inactive samples)', () => {
		const check = createPlaybackStallDetector();
		for (let now = 0; now <= 90_000; now += 3000) {
			expect(check({ src: 'song', time: 20, now, active: false })).toBe(false);
		}
		expect(check({ src: 'song', time: 20, now: 93_000, active: true })).toBe(false);
	});

	it('resets the observation window on track changes and backward seeks', () => {
		const check = createPlaybackStallDetector();
		for (let now = 0; now <= 12_000; now += 3000)
			check({ src: 'one', time: 50, now, active: true });
		expect(check({ src: 'two', time: 0, now: 15_000, active: true })).toBe(false);
		expect(check({ src: 'two', time: 30, now: 18_000, active: true })).toBe(false);
		expect(check({ src: 'two', time: 10, now: 21_000, active: true })).toBe(false);
	});

	it('does not re-arm the retry budget just because a reload restores the position', () => {
		const check = createPlaybackStallDetector();
		let now = 0;
		let count = 0;
		for (; now <= 120_000; now += 3000) {
			if (check({ src: 'song', time: 80, now, active: true })) {
				count++;
				check({ src: 'song', time: 0, now: now + 100, active: false });
				check({ src: 'song', time: 80, now: now + 200, active: true });
			}
		}
		expect(count).toBe(2);
	});
});

describe('cancellable media reload', () => {
	afterEach(() => vi.useRealTimers());
	function setup() {
		vi.useFakeTimers();
		const media = Object.assign(new EventTarget(), {
			load: vi.fn()
		}) as unknown as HTMLMediaElement;
		const resume = vi.fn();
		const cancel = reloadAudio(media, resume);
		return { media, resume, cancel };
	}

	it('resumes once on canplay and removes the fallback timer/listener', () => {
		const { media, resume } = setup();
		expect(media.load).toHaveBeenCalledOnce();
		media.dispatchEvent(new Event('canplay'));
		media.dispatchEvent(new Event('canplay'));
		vi.runAllTimers();
		expect(resume).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('falls back once without leaving a late canplay callback', () => {
		const { media, resume } = setup();
		vi.advanceTimersByTime(2000);
		media.dispatchEvent(new Event('canplay'));
		expect(resume).toHaveBeenCalledOnce();
	});

	it.each(['pause', 'close', 'track change', 'unmount'])('can be cancelled on %s', () => {
		const { media, resume, cancel } = setup();
		cancel();
		media.dispatchEvent(new Event('canplay'));
		vi.runAllTimers();
		expect(resume).not.toHaveBeenCalled();
	});
});
