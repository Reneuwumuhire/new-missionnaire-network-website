// Turns the PCM posted from the native capture into an audio node, so app
// audio joins the same graph as a microphone and needs no special handling
// anywhere downstream.
//
// A worklet cannot be woken by the main thread, so it keeps a small queue and
// drains it a frame at a time. Under-run plays silence rather than glitching;
// over-run drops the oldest block, which bounds latency instead of letting it
// grow all service.

const MAX_QUEUED_BLOCKS = 32; // ~0.3 s at the rates ScreenCaptureKit delivers

class PcmSource extends AudioWorkletProcessor {
	constructor() {
		super();
		this.queue = [];
		this.offset = 0;
		this.port.onmessage = (event) => {
			if (this.queue.length >= MAX_QUEUED_BLOCKS) {
				this.queue.shift();
				this.offset = 0;
			}
			this.queue.push(event.data);
		};
	}

	process(_inputs, outputs) {
		const output = outputs[0];
		const left = output[0];
		const right = output[1] ?? output[0];
		for (let i = 0; i < left.length; i++) {
			const block = this.queue[0];
			if (!block) {
				left[i] = 0;
				right[i] = 0;
				continue;
			}
			left[i] = block[this.offset];
			right[i] = block[this.offset + 1];
			this.offset += 2;
			if (this.offset >= block.length) {
				this.queue.shift();
				this.offset = 0;
			}
		}
		return true;
	}
}

registerProcessor('pcm-source', PcmSource);
