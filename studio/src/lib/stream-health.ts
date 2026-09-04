export type CaptureState = 'healthy' | 'recovering' | 'failed';
export type StreamHealthIssue = 'capture' | 'pipeline' | 'encoder' | null;

/** Immediate first recovery, then short bounded backoff before giving up. */
export const RECOVERY_DELAYS_MS = [0, 1_000, 3_000] as const;

export async function retryRecovery<T>(
	operation: () => Promise<T>,
	stillCurrent: () => boolean,
	waitFor: (delayMs: number) => Promise<unknown> = (delayMs) =>
		new Promise((resolve) => setTimeout(resolve, delayMs))
): Promise<T | null> {
	let lastError: unknown;
	for (const delay of RECOVERY_DELAYS_MS) {
		if (!stillCurrent()) return null;
		if (delay) await waitFor(delay);
		if (!stillCurrent()) return null;
		try {
			return await operation();
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError;
}

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
