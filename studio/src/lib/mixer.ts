// Audio mixing. Every source lands on one bus; the bus feeds the MediaRecorder.
// Monitoring is off by default — a laptop speaker plus the room mic is a
// feedback loop, and finding that out on air is how services get ruined.

export interface Strip {
	id: string;
	gain: GainNode;
	analyser: AnalyserNode;
	node: AudioNode;
	/** Element sources can only be tapped once per element, ever. */
	element: HTMLMediaElement | null;
}

export class Mixer {
	readonly ctx: AudioContext;
	readonly master: GainNode;
	readonly destination: MediaStreamAudioDestinationNode;
	private readonly monitor: GainNode;
	private readonly strips = new Map<string, Strip>();
	/** createMediaElementSource throws if called twice on one element. */
	private readonly elementTaps = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
	/** Scratch buffer for the meters — reused so a 30 Hz UI poll allocates
	 *  nothing. Sized to the analyser's fftSize. */
	private readonly meterBuffer = new Uint8Array(1024);

	constructor() {
		this.ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
		this.master = this.ctx.createGain();
		this.destination = this.ctx.createMediaStreamDestination();
		this.monitor = this.ctx.createGain();
		this.monitor.gain.value = 0;
		this.master.connect(this.destination);
		this.master.connect(this.monitor);
		this.monitor.connect(this.ctx.destination);
	}

	/** The bus always carries a track, even with nothing plugged in — a silent
	 *  track keeps the muxer's timeline sane, and a scene with no audio must
	 *  still stream. */
	get audioTrack(): MediaStreamTrack | undefined {
		return this.destination.stream.getAudioTracks()[0];
	}

	setMonitor(on: boolean) {
		this.monitor.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.02);
	}

	resume(): Promise<void> {
		return this.ctx.state === 'suspended' ? this.ctx.resume() : Promise.resolve();
	}

	private makeStrip(id: string, node: AudioNode, element: HTMLMediaElement | null): Strip {
		const gain = this.ctx.createGain();
		const analyser = this.ctx.createAnalyser();
		analyser.fftSize = 1024;
		analyser.smoothingTimeConstant = 0.4;
		node.connect(gain);
		gain.connect(analyser);
		analyser.connect(this.master);
		const strip: Strip = { id, gain, analyser, node, element };
		this.strips.set(id, strip);
		return strip;
	}

	addStream(id: string, stream: MediaStream): Strip | null {
		if (this.strips.has(id)) return this.strips.get(id)!;
		if (stream.getAudioTracks().length === 0) return null;
		return this.makeStrip(id, this.ctx.createMediaStreamSource(stream), null);
	}

	addElement(id: string, element: HTMLMediaElement): Strip {
		const existing = this.strips.get(id);
		if (existing) return existing;
		let tap = this.elementTaps.get(element);
		if (!tap) {
			tap = this.ctx.createMediaElementSource(element);
			this.elementTaps.set(element, tap);
		}
		return this.makeStrip(id, tap, element);
	}

	remove(id: string) {
		const strip = this.strips.get(id);
		if (!strip) return;
		try {
			strip.node.disconnect();
			strip.gain.disconnect();
			strip.analyser.disconnect();
		} catch {
			// Already torn down by a stopped track — nothing to do.
		}
		this.strips.delete(id);
	}

	has(id: string): boolean {
		return this.strips.has(id);
	}

	ids(): string[] {
		return [...this.strips.keys()];
	}

	setLevel(id: string, gain: number, muted: boolean) {
		const strip = this.strips.get(id);
		if (!strip) return;
		// Ramp instead of jumping — an instant gain change clicks audibly.
		strip.gain.gain.setTargetAtTime(muted ? 0 : gain, this.ctx.currentTime, 0.02);
	}

	/** Peak level 0..1 for a meter. Reads the time-domain buffer rather than
	 *  the FFT so it reflects what a VU meter would show. */
	peak(id: string): number {
		const strip = this.strips.get(id);
		if (!strip) return 0;
		strip.analyser.getByteTimeDomainData(this.meterBuffer);
		let peak = 0;
		for (let i = 0; i < this.meterBuffer.length; i++) {
			const v = Math.abs(this.meterBuffer[i] - 128) / 128;
			if (v > peak) peak = v;
		}
		return peak;
	}

	close() {
		for (const id of this.ids()) this.remove(id);
		void this.ctx.close();
	}
}
