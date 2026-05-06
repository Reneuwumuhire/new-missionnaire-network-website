import { spawn, type ChildProcess } from 'node:child_process';
import { ObjectId } from 'mongodb';
import { ENV } from './env.js';
import {
	ensureRecordingsDir,
	mp3Path,
	removeRecordingFiles,
	segmentMp3Path,
	updateSidecar,
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
import { concatSegments } from './concat.js';
import { extractYoutubeVideoId } from './youtube.js';

interface Segment {
	path: string;
	startedAt: Date;
}

interface ActiveRecording {
	id: ObjectId;
	idStr: string;
	title: string;
	startedAt: Date;
	createdBy: string;
	createdByName: string | null;

	/** Currently-running ffmpeg child. Replaced on every restart. */
	proc: ChildProcess;
	/** Resolves when the *current* `proc` exits. Replaced on every restart. */
	exitPromise: Promise<void>;

	/** All segment files captured so far, in chronological order. */
	segments: Segment[];

	/** Operator pressed Stop — exit handler should not auto-restart. */
	stopping: boolean;
	/** Auto-restart loop has given up; exit handler should not restart. */
	abandoned: boolean;
	/** A restart is pending behind a backoff timer. */
	restartPending: boolean;
	restartTimer: NodeJS.Timeout | null;
	/** ffmpeg restarts where the new segment died in <RESTART_HEALTHY_MS. */
	consecutiveFailures: number;
	/** When the current recovery loop started. Reset whenever a segment runs
	 *  long enough to be considered "healthy". null when not in recovery. */
	recoveryStartedAt: Date | null;

	/** 4-hour wall-clock safety cap from MAX_RECORDING_SECONDS. */
	safetyTimer: NodeJS.Timeout;
}

let active: ActiveRecording | null = null;

/** A segment is "healthy" if it ran for at least this long before exiting.
 *  Below this, an exit looks like a failed-restart, not a real dropout. */
const RESTART_HEALTHY_MS = 5_000;
/** Backoff delays between restart attempts after consecutive failures.
 *  After the array is exhausted, RESTART_BACKOFF_CAP_MS is reused. */
const RESTART_BACKOFF_MS = [3_000, 5_000, 10_000, 20_000];
const RESTART_BACKOFF_CAP_MS = 30_000;
/** Stop trying to recover if no segment has gone healthy in this window.
 *  At that point the upstream is plausibly down for the rest of the
 *  broadcast, and we'd rather finalize what we have than hold an active
 *  slot forever. */
const RECOVERY_GIVE_UP_MS = 30 * 60 * 1000;

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
		createdByName: active.createdByName,
		/** True while ffmpeg is dead and we're between restart attempts. */
		sourceRecovering: active.recoveryStartedAt !== null,
		/** Number of segments captured so far (1 == no dropouts yet). */
		segmentCount: active.segments.length
	} as const;
}

function ffmpegArgsFor(outPath: string): string[] {
	return [
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
		outPath
	];
}

/** Spawn ffmpeg writing to `outPath`. The returned exitPromise resolves
 *  whenever the child exits — caller decides whether that's expected. */
function spawnFfmpeg(outPath: string): { proc: ChildProcess; exitPromise: Promise<void> } {
	const proc = spawn('ffmpeg', ffmpegArgsFor(outPath), {
		stdio: ['ignore', 'inherit', 'inherit']
	});
	const exitPromise = new Promise<void>((resolve) => {
		proc.once('exit', () => resolve());
	});
	return { proc, exitPromise };
}

/** Start a new segment of the currently-active recording. Mutates `active`
 *  to point at the new proc/exitPromise and pushes the segment metadata.
 *  Wires up the exit handler that drives auto-restart.
 *
 *  Sidecar is written *before* ffmpeg spawns so a crash between write and
 *  spawn just leaves a phantom entry that orphan recovery filters out by
 *  fileExists check — no data loss. The reverse order would risk a
 *  segment file existing on disk but not appearing in the sidecar list. */
async function startSegment(rec: ActiveRecording): Promise<void> {
	const segIndex = rec.segments.length + 1;
	const segPath = segmentMp3Path(rec.idStr, segIndex);
	const segment: Segment = { path: segPath, startedAt: new Date() };
	rec.segments.push(segment);

	try {
		await updateSidecar(rec.idStr, { segments: rec.segments.map((s) => s.path) });
	} catch (err) {
		console.warn(`[recorder] sidecar update failed for ${rec.idStr}`, err);
	}

	const { proc, exitPromise } = spawnFfmpeg(segPath);
	rec.proc = proc;
	rec.exitPromise = exitPromise;

	proc.once('exit', (code, signal) => {
		// Snapshot active at exit time — `active` may be null by the time
		// async work below runs (e.g. operator stopped during restart).
		const current = active;
		if (!current || current.idStr !== rec.idStr || current.proc !== proc) return;
		if (current.stopping || current.abandoned) return;

		const segmentLifetimeMs = Date.now() - segment.startedAt.getTime();
		const exitDesc = signal ? `signal=${signal}` : `code=${code}`;
		console.warn(
			`[recorder] ${rec.idStr} segment ${segIndex} exited unexpectedly after ${segmentLifetimeMs}ms (${exitDesc}); scheduling restart`
		);
		scheduleRestart(current, segmentLifetimeMs);
	});

	console.log(
		`[recorder] ${rec.idStr} segment ${segIndex} started -> ${segPath}`
	);
}

function scheduleRestart(rec: ActiveRecording, lastSegmentLifetimeMs: number): void {
	if (rec.restartPending) return;

	const wasHealthy = lastSegmentLifetimeMs >= RESTART_HEALTHY_MS;
	if (wasHealthy) {
		// Real dropout, not a restart loop — reset failure counter and start
		// a fresh recovery window.
		rec.consecutiveFailures = 0;
		rec.recoveryStartedAt = new Date();
	} else {
		rec.consecutiveFailures += 1;
		if (rec.recoveryStartedAt === null) rec.recoveryStartedAt = new Date();
	}

	const inRecoveryFor = Date.now() - rec.recoveryStartedAt.getTime();
	if (inRecoveryFor >= RECOVERY_GIVE_UP_MS) {
		console.error(
			`[recorder] ${rec.idStr} giving up after ${Math.round(inRecoveryFor / 1000)}s in recovery — finalizing what we have`
		);
		rec.abandoned = true;
		// Finalize asynchronously with whatever segments we captured.
		void finalizeAbandoned(rec).catch((err) =>
			console.error(`[recorder] abandoned finalize failed for ${rec.idStr}`, err)
		);
		return;
	}

	const backoffIdx = Math.min(rec.consecutiveFailures, RESTART_BACKOFF_MS.length) - 1;
	const delay =
		backoffIdx < 0
			? RESTART_BACKOFF_MS[0]
			: backoffIdx < RESTART_BACKOFF_MS.length
				? RESTART_BACKOFF_MS[backoffIdx]
				: RESTART_BACKOFF_CAP_MS;

	rec.restartPending = true;
	rec.restartTimer = setTimeout(() => {
		rec.restartTimer = null;
		rec.restartPending = false;
		if (rec.stopping || rec.abandoned) return;
		startSegment(rec).catch((err) => {
			console.error(`[recorder] ${rec.idStr} restart failed`, err);
			// Treat as another fast failure and try again.
			scheduleRestart(rec, 0);
		});
	}, delay);

	console.log(
		`[recorder] ${rec.idStr} restart scheduled in ${delay}ms (consecutive failures: ${rec.consecutiveFailures})`
	);
}

export async function startRecording(params: {
	createdBy: string;
	createdByName?: string | null;
}): Promise<{ id: string; startedAt: string; title: string }> {
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
		createdByName,
		segments: [segmentMp3Path(idStr, 1)]
	});

	await insertRecordingStarting({
		id,
		title,
		startedAt,
		createdBy: params.createdBy,
		createdByName
	});

	const safetyTimer = setTimeout(() => {
		console.warn(`[recorder] safety cap reached for ${idStr}; stopping`);
		void stopRecording().catch((e) => console.error('[recorder] safety stop failed', e));
	}, ENV.MAX_RECORDING_SECONDS * 1000);

	// Build the record then start the first segment, which fills in proc/exitPromise.
	active = {
		id,
		idStr,
		title,
		startedAt,
		createdBy: params.createdBy,
		createdByName,
		proc: null as unknown as ChildProcess,
		exitPromise: Promise.resolve(),
		segments: [],
		stopping: false,
		abandoned: false,
		restartPending: false,
		restartTimer: null,
		consecutiveFailures: 0,
		recoveryStartedAt: null,
		safetyTimer
	};

	try {
		await startSegment(active);
	} catch (err) {
		// First segment failed to spawn — clean up so the slot frees and
		// the operator can retry. spawn() doesn't normally throw sync, but
		// be defensive: a missing ffmpeg binary or fs error would land here.
		clearTimeout(safetyTimer);
		active = null;
		await removeRecordingFiles(idStr);
		try {
			await markRecordingFailed(id, `start failed: ${(err as Error).message}`);
		} catch (markErr) {
			console.error('[recorder] markRecordingFailed failed', markErr);
		}
		throw err;
	}

	console.log(`[recorder] started ${idStr} at ${startedAt.toISOString()}`);
	return { id: idStr, startedAt: startedAt.toISOString(), title };
}

export async function stopRecording(): Promise<{ id: string }> {
	if (!active) throw new Error('No active recording');
	if (active.stopping) throw new Error('Recording is already stopping');

	const rec = active;
	rec.stopping = true;
	clearTimeout(rec.safetyTimer);
	if (rec.restartTimer) {
		clearTimeout(rec.restartTimer);
		rec.restartTimer = null;
	}
	rec.restartPending = false;

	// Kill the in-flight ffmpeg if it's still running. If we're between
	// restarts (proc already exited), there's nothing to kill.
	if (rec.proc && rec.proc.exitCode === null && rec.proc.signalCode === null) {
		rec.proc.kill('SIGINT');
	}
	await rec.exitPromise;

	const endedAt = new Date();

	await finalizeAndUpload(rec, endedAt).catch((err) => {
		console.error(`[recorder] finalize+upload failed for ${rec.idStr}`, err);
	});

	active = null;
	return { id: rec.idStr };
}

/** Recovery gave up — finalize whatever segments we have, mark stopping so
 *  the admin sees a duration, kick off the upload, and clear active state. */
async function finalizeAbandoned(rec: ActiveRecording): Promise<void> {
	rec.stopping = true;
	clearTimeout(rec.safetyTimer);
	if (rec.restartTimer) {
		clearTimeout(rec.restartTimer);
		rec.restartTimer = null;
	}
	rec.restartPending = false;

	if (rec.proc && rec.proc.exitCode === null && rec.proc.signalCode === null) {
		rec.proc.kill('SIGINT');
		await rec.exitPromise;
	}

	const endedAt = new Date();
	await finalizeAndUpload(rec, endedAt).catch((err) =>
		console.error(`[recorder] abandoned finalize+upload failed for ${rec.idStr}`, err)
	);

	if (active && active.idStr === rec.idStr) active = null;
}

/** Concat segments → canonical mp3, mark stopping in DB, then kick off upload
 *  in the background so /stop returns fast. */
async function finalizeAndUpload(rec: ActiveRecording, endedAt: Date): Promise<void> {
	if (rec.segments.length === 0) {
		console.error(`[recorder] ${rec.idStr} no segments captured — nothing to upload`);
		try {
			await markRecordingFailed(rec.id, 'no segments captured');
		} catch (err) {
			console.error('[recorder] markRecordingFailed failed', err);
		}
		await removeRecordingFiles(rec.idStr);
		return;
	}

	try {
		await concatSegments(
			rec.idStr,
			rec.segments.map((s) => s.path)
		);
	} catch (err) {
		console.error(`[recorder] concat failed for ${rec.idStr}`, err);
		try {
			await markRecordingFailed(rec.id, `concat failed: ${(err as Error).message}`);
		} catch (markErr) {
			console.error('[recorder] markRecordingFailed failed', markErr);
		}
		// Leave segment files on disk so an operator can recover manually.
		throw err;
	}

	const wallClockSec = Math.max(
		0,
		Math.floor((endedAt.getTime() - rec.startedAt.getTime()) / 1000)
	);
	const probedSec = await probeDurationSec(mp3Path(rec.idStr));
	const durationSec = probedSec ?? wallClockSec;
	if (probedSec !== null && wallClockSec - probedSec > 30) {
		console.warn(
			`[recorder] ${rec.idStr} audio is ${wallClockSec - probedSec}s shorter than wall clock (probed=${probedSec}s, wall=${wallClockSec}s, segments=${rec.segments.length}) — gaps from upstream loss`
		);
	}

	try {
		await markRecordingStopping(rec.id, endedAt, durationSec);
	} catch (err) {
		console.error('[recorder] failed to mark stopping', err);
	}

	void finalizeUpload(rec).catch((err) => {
		console.error(`[recorder] upload failed for ${rec.idStr}`, err);
	});
}

async function finalizeUpload(
	rec: Pick<ActiveRecording, 'id' | 'idStr' | 'startedAt'>
): Promise<void> {
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
			thumbnailS3Key: snap.thumbnail_s3_key,
			title: snap.title,
			description: snap.description,
			sourceVideoId: extractYoutubeVideoId(snap.youtube_url),
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
