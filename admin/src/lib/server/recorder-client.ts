import { env } from '$env/dynamic/private';

export interface RecorderStatus {
	recording: boolean;
	id?: string;
	title?: string;
	startedAt?: string;
	elapsedSec?: number;
	stopping?: boolean;
	createdBy?: string;
	createdByName?: string | null;
	pendingOrphans: number;
	/** Orphan recovery (post-restart upload backfill) is running. */
	recovering: boolean;
	/** ffmpeg died unexpectedly mid-broadcast; recorder is between
	 *  restart attempts. UI should show "reconnecting…". */
	sourceRecovering?: boolean;
	/** How many segments the recording is composed of so far. >1 means
	 *  the upstream dropped at least once; the segments will be concat'd
	 *  on Stop. */
	segmentCount?: number;
}

export interface StartResult {
	id: string;
	startedAt: string;
	title: string;
}

export class RecorderError extends Error {
	constructor(
		message: string,
		public readonly status: number,
		public readonly code?: string
	) {
		super(message);
		this.name = 'RecorderError';
	}
}

/** Hard cap for any recorder HTTP call. Fly free-tier instances cold-start
 *  in ~5–10s; the page loaders that read recorderStatus() shouldn't block
 *  that long. A 3s timeout matches what icecast.ts uses for the same reason. */
const RECORDER_TIMEOUT_MS = 3000;

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
	const baseUrl = env.RECORDER_URL;
	const token = env.RECORDER_TOKEN;
	if (!baseUrl || !token) {
		throw new RecorderError('Recorder service not configured', 503, 'not_configured');
	}
	const headers = new Headers(init.headers);
	headers.set('Authorization', `Bearer ${token}`);
	if (init.body && !headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/json');
	}
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), RECORDER_TIMEOUT_MS);
	let res: Response;
	try {
		res = await fetch(`${baseUrl}${path}`, { ...init, headers, signal: controller.signal });
	} catch (err) {
		if ((err as Error).name === 'AbortError') {
			throw new RecorderError(
				`Recorder service timed out after ${RECORDER_TIMEOUT_MS}ms`,
				504,
				'timeout'
			);
		}
		throw err;
	} finally {
		clearTimeout(timeout);
	}
	const text = await res.text();
	const parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
	if (!res.ok) {
		const code = typeof parsed.error === 'string' ? parsed.error : undefined;
		const msg = typeof parsed.message === 'string' ? parsed.message : `Recorder error ${res.status}`;
		throw new RecorderError(msg, res.status, code);
	}
	return parsed as T;
}

export function recorderStatus(): Promise<RecorderStatus> {
	return call<RecorderStatus>('/status', { method: 'GET' });
}

export function recorderStart(
	createdBy: string,
	createdByName?: string | null
): Promise<StartResult> {
	return call<StartResult>('/start', {
		method: 'POST',
		body: JSON.stringify({ createdBy, createdByName: createdByName ?? null })
	});
}

export function recorderStop(): Promise<{ id: string }> {
	return call<{ id: string }>('/stop', { method: 'POST' });
}

export function recorderRetry(id: string): Promise<{ ok: true }> {
	return call<{ ok: true }>(`/retry/${encodeURIComponent(id)}`, { method: 'POST' });
}
