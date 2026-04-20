import { spawn, type ChildProcess } from 'node:child_process';
import { ObjectId } from 'mongodb';
import { ENV } from './env.js';
import {
	ensureRecordingsDir,
	mp3Path,
	removeRecordingFiles,
	writeSidecar
} from './sidecar.js';
import {
	getBroadcastSnapshot,
	insertRecordingStarting,
	markRecordingFailed,
	markRecordingReady,
	markRecordingStopping
} from './mongo.js';
import { buildDownloadFilename, uploadRecording } from './upload.js';
import { probeDurationSec } from './probe.js';
import { generatePeaks } from './peaks.js';

interface ActiveRecording {
	id: ObjectId;
	idStr: string;
	title: string;
	startedAt: Date;
	createdBy: string;
	createdByName: string | null;
	proc: ChildProcess;
	safetyTimer: NodeJS.Timeout;
	stopping: boolean;
	exitPromise: Promise<void>;
}

let active: ActiveRecording | null = null;

export function isRecording(): boolean {
	return active !== null;
}

export function currentStatus() {
	if (!active) return { recording: false } as const;
	return {
		recording: true,
		id: active.idStr,
		title: active.title,
		startedAt: active.startedAt.toISOString(),
		elapsedSec: Math.floor((Date.now() - active.startedAt.getTime()) / 1000),
		stopping: active.stopping,
		createdBy: active.createdBy,
		createdByName: active.createdByName
	} as const;
}

export async function startRecording(params: { createdBy: string; createdByName?: string | null }): Promise<{ id: string; startedAt: string; title: string }> {
	if (active) throw new Error('Another recording is already active');
	await ensureRecordingsDir();

	const startedAt = new Date();
	const id = new ObjectId();
	const idStr = id.toHexString();
	const title = buildDownloadFilename(startedAt).replace(/\.mp3$/, '');
	const createdByName = params.createdByName?.trim() || null;

	await writeSidecar({
		id: idStr,
		title,
		startedAt: startedAt.toISOString(),
		createdBy: params.createdBy,
		createdByName
	});

	await insertRecordingStarting({ id, title, startedAt, createdBy: params.createdBy, createdByName });

	const args = [
		'-nostdin',
		'-hide_banner',
		'-loglevel',
		'warning',
		'-reconnect',
		'1',
		'-reconnect_streamed',
		'1',
		'-reconnect_at_eof',
		'1',
		'-reconnect_on_network_error',
		'1',
		'-reconnect_on_http_error',
		'4xx,5xx',
		'-reconnect_delay_max',
		'5',
		// 10s I/O read timeout (microseconds) — surfaces a stalled TCP socket fast
		// after a network switch (e.g. Wi-Fi → hotspot) so reconnect logic can fire.
		'-rw_timeout',
		'10000000',
		'-i',
		ENV.ICECAST_URL,
		'-c',
		'copy',
		'-y',
		mp3Path(idStr)
	];

	const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] });

	const exitPromise = new Promise<void>((resolve) => {
		proc.once('exit', () => resolve());
	});

	const safetyTimer = setTimeout(() => {
		console.warn(`[recorder] safety cap reached for ${idStr}; stopping`);
		void stopRecording().catch((e) => console.error('[recorder] safety stop failed', e));
	}, ENV.MAX_RECORDING_SECONDS * 1000);

	active = {
		id,
		idStr,
		title,
		startedAt,
		createdBy: params.createdBy,
		createdByName,
		proc,
		safetyTimer,
		stopping: false,
		exitPromise
	};

	console.log(`[recorder] started ${idStr} at ${startedAt.toISOString()}`);
	return { id: idStr, startedAt: startedAt.toISOString(), title };
}

export async function stopRecording(): Promise<{ id: string }> {
	if (!active) throw new Error('No active recording');
	if (active.stopping) throw new Error('Recording is already stopping');

	const rec = active;
	rec.stopping = true;
	clearTimeout(rec.safetyTimer);

	if (rec.proc.exitCode === null) {
		rec.proc.kill('SIGINT');
	}

	await rec.exitPromise;
	const endedAt = new Date();
	const wallClockSec = Math.max(0, Math.floor((endedAt.getTime() - rec.startedAt.getTime()) / 1000));
	const probedSec = await probeDurationSec(mp3Path(rec.idStr));
	// Prefer the actual audio duration so the UI matches the file. Fall back to
	// wall-clock only if ffprobe couldn't read the file.
	const durationSec = probedSec ?? wallClockSec;
	if (probedSec !== null && wallClockSec - probedSec > 30) {
		console.warn(
			`[recorder] ${rec.idStr} audio is ${wallClockSec - probedSec}s shorter than wall clock (probed=${probedSec}s, wall=${wallClockSec}s) — likely network loss during recording`
		);
	}

	try {
		await markRecordingStopping(rec.id, endedAt, durationSec);
	} catch (err) {
		console.error('[recorder] failed to mark stopping', err);
	}

	active = null;

	void finalizeUpload(rec).catch((err) => {
		console.error(`[recorder] finalize failed for ${rec.idStr}`, err);
	});

	return { id: rec.idStr };
}

async function finalizeUpload(rec: Pick<ActiveRecording, 'id' | 'idStr' | 'startedAt'>): Promise<void> {
	try {
		// Snapshot whatever title + thumbnail the admin has configured right now.
		// If they change or clear either later, this recording keeps what was live
		// at save time — matches what the audience actually saw during the broadcast.
		// Fetched before upload so the title can be baked into Content-Disposition.
		const snap = await getBroadcastSnapshot();
		const localPath = mp3Path(rec.idStr);
		// Upload and peaks generation both read the file — run in parallel so
		// the admin sees `ready` as soon as both network + peaks finish instead
		// of paying them serially. A peaks failure is non-fatal: the admin
		// editor falls back to client-side decode.
		const probedSec = (await probeDurationSec(localPath)) ?? 0;
		const [uploadResult, peaksResult] = await Promise.all([
			uploadRecording({
				id: rec.idStr,
				filePath: localPath,
				startedAt: rec.startedAt,
				title: snap.title
			}),
			generatePeaks(localPath, probedSec).catch((err) => {
				console.warn(`[recorder] peaks generation failed for ${rec.idStr}:`, err);
				return null;
			})
		]);
		const { s3Key, s3Url, sizeBytes } = uploadResult;
		await markRecordingReady(rec.id, {
			s3Key,
			s3Url,
			sizeBytes,
			thumbnailUrl: snap.thumbnail_url,
			title: snap.title,
			description: snap.description,
			peaks: peaksResult?.peaks ?? null,
			peaksDurationSec: peaksResult?.durationSec ?? null
		});
		await removeRecordingFiles(rec.idStr);
		const peaksNote = peaksResult ? ` (peaks: ${peaksResult.peaks.length} bins)` : '';
		console.log(`[recorder] uploaded ${rec.idStr} -> ${s3Key}${peaksNote}`);
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		await markRecordingFailed(rec.id, reason).catch((e) =>
			console.error('[recorder] markRecordingFailed also failed', e)
		);
		throw err;
	}
}

/** Retry upload for a given orphan/failed recording id. Used by /retry and orphan recovery. */
export async function retryUpload(params: { id: string; startedAt: Date }): Promise<void> {
	const objectId = new ObjectId(params.id);
	await finalizeUpload({ id: objectId, idStr: params.id, startedAt: params.startedAt });
}
