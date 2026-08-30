import { describe, expect, it } from 'vitest';
import {
	FEATURE_DIMENSIONS,
	LiveFeatureExtractor,
	MATCH_WINDOW_FRAMES,
	ReferenceIndex,
	advancingMatch
} from './reference-match';

function fixture(frames: number): Float32Array {
	const values = new Float32Array(frames * FEATURE_DIMENSIONS);
	for (let frame = 0; frame < frames; frame++) {
		values[frame * 3] = Math.sin(frame * 0.17) + Math.sin(frame * 0.037) * 0.4;
		values[frame * 3 + 1] = Math.cos(frame * 0.11) + Math.sin(frame * 0.071) * 0.3;
		values[frame * 3 + 2] = 0.1 + Math.sin(frame * 0.053) * 0.04;
	}
	return values;
}

describe('reference audio matching', () => {
	it('locates the same advancing recording after an unrelated introduction', () => {
		const reference = fixture(600);
		const start = 237;
		const live = reference.slice(start * 3, (start + MATCH_WINDOW_FRAMES) * 3);
		const match = new ReferenceIndex(reference).match(live);
		expect(match?.startFrame).toBe(start);
		expect(match?.score).toBeGreaterThan(0.99);
		expect(match?.uniqueness).toBeGreaterThan(0.05);
		expect(
			advancingMatch(
				{ startFrame: start, capturedFrame: 80 },
				{ startFrame: start + 10, capturedFrame: 90 }
			)
		).toBe(true);
	});

	it('stays identifiable with quieter background audio and a narrow follow-up search', () => {
		const reference = fixture(600);
		const start = 237;
		const live = reference.slice(start * 3, (start + MATCH_WINDOW_FRAMES) * 3);
		for (let index = 0; index < live.length; index++) live[index] += Math.sin(index * 0.9) * 0.04;
		const match = new ReferenceIndex(reference).match(live, start + 4);
		expect(match?.startFrame).toBe(start);
		expect(match?.score).toBeGreaterThan(0.9);
	});

	it('extracts the same features when PCM arrives in uneven blocks', () => {
		const pcm = Float32Array.from({ length: 48_000 * 2 }, (_, index) =>
			Math.sin((index / 2) * 0.031)
		);
		const whole = new LiveFeatureExtractor().consume(pcm);
		const chunkedExtractor = new LiveFeatureExtractor();
		const chunked = [
			...chunkedExtractor.consume(pcm.slice(0, 12_346)),
			...chunkedExtractor.consume(pcm.slice(12_346, 57_892)),
			...chunkedExtractor.consume(pcm.slice(57_892))
		];
		expect(chunked).toEqual(whole);
	});

	it('refuses a flat signal that could be silence or a held tone', () => {
		const reference = fixture(600);
		const flat = new Float32Array(MATCH_WINDOW_FRAMES * FEATURE_DIMENSIONS).fill(0.2);
		expect(new ReferenceIndex(reference).match(flat)).toBeNull();
	});
});
