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

interface ActiveRecording {
	id: ObjectId;
	idStr: string;
	title: string;
	startedAt: Date;
	createdBy: string;
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
		stopping: active.stopping
	} as const;
}

export async function startRecording(params: { createdBy: string }): Promise<{ id: string; startedAt: string; title: string }> {
	if (active) throw new Error('Another recording is already active');
	await ensureRecordingsDir();

	const startedAt = new Date();
	const id = new ObjectId();
	const idStr = id.toHexString();
	const title = buildDownloadFilename(startedAt).replace(/\.mp3$/, '');

	await writeSidecar({
		id: idStr,
		title,
		startedAt: startedAt.toISOString(),
		createdBy: params.createdBy
	});

	await insertRecordingStarting({ id, title, startedAt, createdBy: params.createdBy });

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
		'-reconnect_delay_max',
		'30',
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
	const durationSec = Math.max(0, Math.floor((endedAt.getTime() - rec.startedAt.getTime()) / 1000));

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
		const { s3Key, s3Url, sizeBytes } = await uploadRecording({
			id: rec.idStr,
			filePath: mp3Path(rec.idStr),
			startedAt: rec.startedAt,
			title: snap.title
		});
		await markRecordingReady(rec.id, {
			s3Key,
			s3Url,
			sizeBytes,
			thumbnailUrl: snap.thumbnail_url,
			title: snap.title,
			description: snap.description
		});
		await removeRecordingFiles(rec.idStr);
		console.log(`[recorder] uploaded ${rec.idStr} -> ${s3Key}`);
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
