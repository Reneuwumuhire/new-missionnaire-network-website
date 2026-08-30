// Lightweight reference-audio matching. The native side reduces the MP3 to
// three scale-insensitive features per 100 ms; this file extracts the same
// features from captured browser PCM and finds the best advancing window.

export const FEATURE_DIMENSIONS = 3;
export const FEATURE_MS = 100;
export const MATCH_WINDOW_FRAMES = 80;

export interface Match {
	startFrame: number;
	score: number;
	uniqueness: number;
}

export class LiveFeatureExtractor {
	private count = 0;
	private sumSq = 0;
	private diffSq = 0;
	private crossings = 0;
	private last: number | null = null;
	private downsampleCount = 0;
	private downsampleSum = 0;
	private readonly stride: number;
	private readonly frameSamples: number;

	constructor(
		private readonly inputRate = 48_000,
		private readonly channels = 2,
		private readonly targetRate = 8_000
	) {
		this.stride = Math.max(1, Math.round(inputRate / targetRate));
		this.frameSamples = Math.round((targetRate * FEATURE_MS) / 1000);
	}

	consume(interleaved: Float32Array): number[] {
		const features: number[] = [];
		for (let offset = 0; offset + this.channels <= interleaved.length; offset += this.channels) {
			let sample = 0;
			for (let channel = 0; channel < this.channels; channel++) {
				sample += interleaved[offset + channel] ?? 0;
			}
			sample /= this.channels;
			this.downsampleSum += sample;
			this.downsampleCount++;
			if (this.downsampleCount < this.stride) continue;
			sample = this.downsampleSum / this.downsampleCount;
			this.downsampleCount = 0;
			this.downsampleSum = 0;
			this.sumSq += sample * sample;
			if (this.last !== null) {
				const difference = sample - this.last;
				this.diffSq += difference * difference;
				if (sample >= 0 !== this.last >= 0) this.crossings++;
			}
			this.last = sample;
			this.count++;
			if (this.count === this.frameSamples) {
				features.push(
					Math.log1p(Math.sqrt(this.sumSq / this.count) * 1000),
					Math.log1p(Math.sqrt(this.diffSq / this.count) * 1000),
					this.crossings / this.count
				);
				this.count = 0;
				this.sumSq = 0;
				this.diffSq = 0;
				this.crossings = 0;
			}
		}
		return features;
	}
}

export class ReferenceIndex {
	private readonly frames: number;
	private readonly sums: Float64Array[];
	private readonly squares: Float64Array[];

	constructor(private readonly features: Float32Array) {
		this.frames = Math.floor(features.length / FEATURE_DIMENSIONS);
		this.sums = Array.from({ length: FEATURE_DIMENSIONS }, () => new Float64Array(this.frames + 1));
		this.squares = Array.from(
			{ length: FEATURE_DIMENSIONS },
			() => new Float64Array(this.frames + 1)
		);
		for (let frame = 0; frame < this.frames; frame++) {
			for (let dimension = 0; dimension < FEATURE_DIMENSIONS; dimension++) {
				const value = features[frame * FEATURE_DIMENSIONS + dimension];
				this.sums[dimension][frame + 1] = this.sums[dimension][frame] + value;
				this.squares[dimension][frame + 1] = this.squares[dimension][frame] + value * value;
			}
		}
	}

	match(live: Float32Array, expectedStart?: number, radiusFrames = 100): Match | null {
		const liveFrames = Math.floor(live.length / FEATURE_DIMENSIONS);
		if (liveFrames < 20 || liveFrames > this.frames) return null;

		const liveMeans = new Float64Array(FEATURE_DIMENSIONS);
		const liveNorms = new Float64Array(FEATURE_DIMENSIONS);
		for (let dimension = 0; dimension < FEATURE_DIMENSIONS; dimension++) {
			for (let frame = 0; frame < liveFrames; frame++) {
				liveMeans[dimension] += live[frame * FEATURE_DIMENSIONS + dimension];
			}
			liveMeans[dimension] /= liveFrames;
			for (let frame = 0; frame < liveFrames; frame++) {
				const centered = live[frame * FEATURE_DIMENSIONS + dimension] - liveMeans[dimension];
				liveNorms[dimension] += centered * centered;
			}
			liveNorms[dimension] = Math.sqrt(liveNorms[dimension]);
		}
		// Silence and flat tones are not identities. Speech must vary in both its
		// envelope and its high-frequency movement before it may lock captions.
		if (liveNorms[0] < 0.1 || liveNorms[1] < 0.1) return null;

		const weights = [0.55, 0.35, 0.1];
		const lastStart = this.frames - liveFrames;
		const searchStart =
			expectedStart === undefined ? 0 : Math.max(0, Math.floor(expectedStart - radiusFrames));
		const searchEnd =
			expectedStart === undefined
				? lastStart
				: Math.min(lastStart, Math.ceil(expectedStart + radiusFrames));
		const scores = new Float32Array(searchEnd - searchStart + 1);
		let bestStart = -1;
		let bestScore = -1;
		for (let start = searchStart; start <= searchEnd; start++) {
			let score = 0;
			for (let dimension = 0; dimension < FEATURE_DIMENSIONS; dimension++) {
				const sum = this.sums[dimension][start + liveFrames] - this.sums[dimension][start];
				const square = this.squares[dimension][start + liveFrames] - this.squares[dimension][start];
				const referenceNorm = Math.sqrt(Math.max(0, square - (sum * sum) / liveFrames));
				if (referenceNorm < 1e-6 || liveNorms[dimension] < 1e-6) continue;
				let dot = 0;
				for (let frame = 0; frame < liveFrames; frame++) {
					dot +=
						this.features[(start + frame) * FEATURE_DIMENSIONS + dimension] *
						(live[frame * FEATURE_DIMENSIONS + dimension] - liveMeans[dimension]);
				}
				score += weights[dimension] * (dot / (referenceNorm * liveNorms[dimension]));
			}
			scores[start - searchStart] = score;
			if (score > bestScore) {
				bestScore = score;
				bestStart = start;
			}
		}
		if (bestStart < 0) return null;
		let second = -1;
		const exclusion = Math.floor(liveFrames / 2);
		for (let start = searchStart; start <= searchEnd; start++) {
			if (Math.abs(start - bestStart) <= exclusion) continue;
			second = Math.max(second, scores[start - searchStart]);
		}
		return { startFrame: bestStart, score: bestScore, uniqueness: bestScore - second };
	}
}

export function advancingMatch(
	previous: { startFrame: number; capturedFrame: number },
	next: { startFrame: number; capturedFrame: number },
	toleranceFrames = 4
): boolean {
	const expected = previous.startFrame + next.capturedFrame - previous.capturedFrame;
	return Math.abs(next.startFrame - expected) <= toleranceFrames;
}
