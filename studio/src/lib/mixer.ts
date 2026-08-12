// Audio mixing. Every source lands on one bus; the bus feeds the MediaRecorder.
// Monitoring is off by default — a laptop speaker plus the room mic is a
// feedback loop, and finding that out on air is how services get ruined.

/** The whole desk runs at 48 kHz: the native app capture arrives at that rate,
 *  and a mic asked for anything else would have to be resampled by the engine —
 *  which WebKit does not do for a MediaStream source. */
export const MIX_RATE = 48000;

export interface Strip {
	id: string;
	gain: GainNode;
	/** One analyser per channel: a desk feed with a dead right leg looks
	 *  perfectly healthy on a summed meter, which is exactly the fault you want
	 *  a meter to show you. */
	analysers: [AnalyserNode, AnalyserNode];
	node: AudioNode;
	/** The stream this strip was built from, so a device change is noticed. */
	stream: MediaStream | null;
	/** Element sources can only be tapped once per element, ever. */
	element: HTMLMediaElement | null;
}

/** Strips the on-air scene no longer justifies. Global sources — the mixer's
 *  own inputs: mics and application audio — are never in the answer: they
 *  belong to the show, not to a scene, exactly as a device in OBS's
 *  Settings → Audio keeps running whatever is on air. Only a scene's own
 *  layers come and go with it. */
export function stripsToDrop(global: string[], onAir: Iterable<string>, inBus: string[]): string[] {
	const keep = new Set<string>([...global, ...onAir]);
	return inBus.filter((id) => !keep.has(id));
}

export class Mixer {
	readonly ctx: AudioContext;
	readonly master: GainNode;
	readonly destination: MediaStreamAudioDestinationNode;
	private readonly monitor: GainNode;
	private readonly strips = new Map<string, Strip>();
	/** createMediaElementSource throws if called twice on one element. */
	private readonly elementTaps = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
	/** addModule is once per context; every app-audio strip shares the module. */
	private workletReady: Promise<void> | null = null;
	/** Scratch buffer for the meters — reused so a 30 Hz UI poll allocates
	 *  nothing. Sized to the analyser's fftSize.
	 *
	 *  Float, not bytes: a byte sample cannot go finer than 1/128 of full
	 *  scale, so a byte meter bottoms out at −42 dB and the whole lower half of
	 *  a −60..0 scale is a lie. */
	private readonly meterBuffer = new Float32Array(1024);

	constructor() {
		this.ctx = new AudioContext({ sampleRate: MIX_RATE, latencyHint: 'interactive' });
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

	private makeStrip(
		id: string,
		node: AudioNode,
		element: HTMLMediaElement | null,
		mono = false,
		stream: MediaStream | null = null
	): Strip {
		const gain = this.ctx.createGain();
		// Force two channels so a mono source is upmixed to both legs rather
		// than metering as a dead right channel.
		gain.channelCount = 2;
		gain.channelCountMode = 'explicit';
		gain.channelInterpretation = 'speakers';

		const analysers = [this.ctx.createAnalyser(), this.ctx.createAnalyser()] as [
			AnalyserNode,
			AnalyserNode
		];
		const splitter = this.ctx.createChannelSplitter(2);
		for (const [channel, analyser] of analysers.entries()) {
			analyser.fftSize = 1024;
			analyser.smoothingTimeConstant = 0.4;
			splitter.connect(analyser, channel);
		}

		// A mono source has to reach both legs. WebKit will not do the up-mix an
		// explicit stereo node is supposed to do — a webcam mic arrives on the
		// left with silence on the right, which is half a preacher on air and a
		// meter with one dead bar — and its node claims two channels either way,
		// so the node cannot be asked. The caller says instead.
		if (mono) {
			const split = this.ctx.createChannelSplitter(2);
			const merger = this.ctx.createChannelMerger(2);
			node.connect(split);
			split.connect(merger, 0, 0);
			split.connect(merger, 0, 1);
			merger.connect(gain);
		} else {
			node.connect(gain);
		}
		// The meters tap the signal; the master takes it from the gain node
		// directly, so an analyser can never sit in the audio path.
		gain.connect(splitter);
		gain.connect(this.master);

		const strip: Strip = { id, gain, analysers, node, stream, element };
		this.strips.set(id, strip);
		return strip;
	}

	addStream(id: string, stream: MediaStream): Strip | null {
		const existing = this.strips.get(id);
		if (existing) {
			if (existing.stream === stream) return existing;
			// A different stream under the same id is the operator changing
			// device. The strip is deliberately kept alive across the gap — it is
			// global, and a scene change must not drop it — so without this the
			// strip would keep the node of a track that has already been stopped
			// and meter nothing for the rest of the service.
			this.remove(id);
		}
		const track = stream.getAudioTracks()[0];
		if (!track) return null;
		// A device that does not declare two channels is treated as mono, and a
		// mono device is the normal case for a microphone. Getting that wrong the
		// other way is silence on one side of the broadcast.
		// ponytail: a stereo interface that declares nothing is folded to its
		// left leg — give the strip a stereo switch if one ever turns up.
		const mono = (track.getSettings().channelCount ?? 1) < 2;
		return this.makeStrip(id, this.ctx.createMediaStreamSource(stream), null, mono, stream);
	}

	/** Load the PCM worklet, once. */
	async ensureWorklet(moduleUrl: string): Promise<void> {
		if (!this.workletReady) {
			this.workletReady = this.ctx.audioWorklet.addModule(moduleUrl);
		}
		return this.workletReady;
	}

	/** Any node as a strip — used by the native app-audio capture, which
	 *  arrives as a worklet rather than a device stream but is otherwise an
	 *  ordinary source with a fader, a meter and monitoring. */
	addNode(id: string, node: AudioNode): Strip {
		const existing = this.strips.get(id);
		if (existing) return existing;
		return this.makeStrip(id, node, null);
	}

	addElement(id: string, element: HTMLMediaElement): Strip {
		const existing = this.strips.get(id);
		if (existing) return existing;
		let tap = this.elementTaps.get(element);
		if (!tap) {
			tap = this.ctx.createMediaElementSource(element);
			this.elementTaps.set(element, tap);
		}
		// Now that the signal is routed into the graph it no longer reaches the
		// speakers, so the mute that kept it quiet until this moment has to come
		// off — it applies before the tap, and would hand the mix silence.
		element.muted = false;
		return this.makeStrip(id, tap, element);
	}

	remove(id: string) {
		const strip = this.strips.get(id);
		if (!strip) return;
		// Off the bus is out of the mix, and an untapped element plays straight
		// out of the laptop — which is a feedback loop with an open microphone.
		if (strip.element) strip.element.muted = true;
		try {
			strip.node.disconnect();
			strip.gain.disconnect();
			strip.analysers.forEach((analyser) => analyser.disconnect());
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
		const target = muted ? 0 : gain;
		const now = this.ctx.currentTime;
		const param = strip.gain.gain;
		// A short linear ramp, not setTargetAtTime. The exponential approach
		// only ever nears its target, so dragging a fader — which reschedules on
		// every pointer event — leaves the level permanently chasing the thumb,
		// and a mute never quite reaches silence. Cancelling first stops a ramp
		// already in flight from fighting this one.
		param.cancelScheduledValues(now);
		param.setValueAtTime(param.value, now);
		param.linearRampToValueAtTime(target, now + 0.015);
	}

	/** Peak level 0..1 per channel. Reads the time-domain buffer rather than the
	 *  FFT so it reflects what a VU meter would show. */
	peaks(id: string): [number, number] {
		const strip = this.strips.get(id);
		if (!strip) return [0, 0];
		return [this.peakOf(strip.analysers[0]), this.peakOf(strip.analysers[1])];
	}

	private peakOf(analyser: AnalyserNode): number {
		analyser.getFloatTimeDomainData(this.meterBuffer);
		let peak = 0;
		for (let i = 0; i < this.meterBuffer.length; i++) {
			const v = Math.abs(this.meterBuffer[i]);
			if (v > peak) peak = v;
		}
		return peak;
	}

	close() {
		for (const id of this.ids()) this.remove(id);
		void this.ctx.close();
	}
}
