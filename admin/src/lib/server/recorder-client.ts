import { env } from '$env/dynamic/private';

export interface RecorderStatus {
	recording: boolean;
	id?: string;
	title?: string;
	startedAt?: string;
	elapsedSec?: number;
	stopping?: boolean;
	pendingOrphans: number;
	recovering: boolean;
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
	const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
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

export function recorderStart(createdBy: string): Promise<StartResult> {
	return call<StartResult>('/start', {
		method: 'POST',
		body: JSON.stringify({ createdBy })
	});
}

export function recorderStop(): Promise<{ id: string }> {
	return call<{ id: string }>('/stop', { method: 'POST' });
}

export function recorderRetry(id: string): Promise<{ ok: true }> {
	return call<{ ok: true }>(`/retry/${encodeURIComponent(id)}`, { method: 'POST' });
}
