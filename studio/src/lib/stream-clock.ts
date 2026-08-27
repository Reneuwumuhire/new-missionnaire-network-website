// Maps Studio's source clock to the media timeline ffmpeg has actually pushed.
// The webview can be ahead of ffmpeg while encoding or an uplink is congested;
// publishing the unadjusted source position makes website subtitles lead audio.

let inputEpochMs: number | null = null;
let outputMediaMs = 0;
let outputSampleEpochMs = 0;
let serverOffsetMs = 0;
let bestServerRttMs = Number.POSITIVE_INFINITY;

export function startStreamClock(atEpochMs = Date.now()) {
	inputEpochMs = atEpochMs;
	outputMediaMs = 0;
	outputSampleEpochMs = 0;
}

export function sampleOutputClock(mediaMs: number, atEpochMs = Date.now()) {
	if (inputEpochMs === null || !Number.isFinite(mediaMs) || mediaMs < 0) return;
	outputMediaMs = mediaMs;
	outputSampleEpochMs = atEpochMs;
}

export function stopStreamClock() {
	inputEpochMs = null;
	outputMediaMs = 0;
	outputSampleEpochMs = 0;
}

/** Source/SRT position corresponding to the frame ffmpeg is currently sending. */
export function outputAlignedPositionMs(sourcePositionMs: number, atEpochMs = Date.now()): number {
	if (
		inputEpochMs === null ||
		outputSampleEpochMs === 0 ||
		atEpochMs - outputSampleEpochMs > 2500
	) {
		return Math.max(0, Math.round(sourcePositionMs));
	}
	const inputMediaAtSample = outputSampleEpochMs - inputEpochMs;
	const pipelineDelayMs = Math.max(0, inputMediaAtSample - outputMediaMs);
	return Math.max(0, Math.round(sourcePositionMs - pipelineDelayMs));
}

/** NTP clock estimate that removes the server's database-processing time. */
export function sampleServerClock(
	serverReceivedAtMs: number,
	serverSentAtMs: number,
	clientSentAtMs: number,
	clientReceivedAtMs: number
) {
	const networkRtt = clientReceivedAtMs - clientSentAtMs - (serverSentAtMs - serverReceivedAtMs);
	if (
		![serverReceivedAtMs, serverSentAtMs, clientSentAtMs, clientReceivedAtMs].every(
			Number.isFinite
		) ||
		networkRtt < 0 ||
		networkRtt >= bestServerRttMs
	)
		return;
	bestServerRttMs = networkRtt;
	serverOffsetMs =
		(serverReceivedAtMs - clientSentAtMs + (serverSentAtMs - clientReceivedAtMs)) / 2;
}

export function serverEpochMs(localEpochMs = Date.now()): number {
	return Math.round(localEpochMs + serverOffsetMs);
}
