// Batches a captured display's audio into 100 ms stereo blocks for reference
// matching. Its output stays silent: the real signal already travels through
// the mixer's stream node, so copying it here would play it twice.

const FRAMES_PER_BLOCK = sampleRate / 10;

class ReferenceObserver extends AudioWorkletProcessor {
	constructor() {
		super();
		this.block = new Float32Array(FRAMES_PER_BLOCK * 2);
		this.offset = 0;
	}

	process(inputs) {
		const input = inputs[0];
		const left = input?.[0];
		if (!left) return true;
		const right = input[1] ?? left;
		for (let frame = 0; frame < left.length; frame++) {
			this.block[this.offset++] = left[frame];
			this.block[this.offset++] = right[frame];
			if (this.offset === this.block.length) {
				this.port.postMessage(this.block, [this.block.buffer]);
				this.block = new Float32Array(FRAMES_PER_BLOCK * 2);
				this.offset = 0;
			}
		}
		return true;
	}
}

registerProcessor('reference-observer', ReferenceObserver);
