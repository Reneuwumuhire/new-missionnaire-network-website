export type CaptureState = 'healthy' | 'recovering' | 'failed';
export type StreamHealthIssue = 'capture' | 'pipeline' | 'encoder' | null;

interface HealthStats {
	backpressure_events: number;
	dropped_frames: number;
	speed: number;
}

/** A recorder can stay in `recording` forever while WebKit emits no data. */
export function captureHasStalled(
	recorderState: RecordingState | 'missing',
	lastChunkAt: number,
	now: number,
	timeoutMs: number
): boolean {
	return recorderState !== 'recording' || now - lastChunkAt >= timeoutMs;
}

/** Keep capture, network and encoder failures separate so the suggested fix is true. */
export function streamHealthIssue(
	stats: HealthStats | null,
	captureState: CaptureState
): StreamHealthIssue {
	if (captureState !== 'healthy') return 'capture';
	if (!stats) return null;
	if (stats.backpressure_events > 0) return 'pipeline';
	if (stats.dropped_frames > 0 || (stats.speed > 0 && stats.speed < 0.95)) return 'encoder';
	return null;
}
