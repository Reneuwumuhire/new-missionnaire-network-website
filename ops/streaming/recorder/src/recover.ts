import { ObjectId } from 'mongodb';
import { findRecording, markRecordingStopping } from './mongo.js';
import { listOrphanIds, mp3Exists, readSidecar, removeRecordingFiles } from './sidecar.js';
import { retryUpload } from './ffmpeg.js';

let pending = 0;
let running = false;

export function pendingOrphans(): number {
	return pending;
}

export function isRecovering(): boolean {
	return running;
}

export async function recoverOrphans(): Promise<void> {
	if (running) return;
	running = true;
	try {
		const ids = await listOrphanIds();
		pending = ids.length;
		if (ids.length === 0) return;

		console.log(`[recorder] recovering ${ids.length} orphan recording(s)`);

		for (const id of ids) {
			try {
				if (!ObjectId.isValid(id)) {
					console.warn(`[recorder] skipping orphan with invalid id: ${id}`);
					await removeRecordingFiles(id);
					continue;
				}
				const sidecar = await readSidecar(id);
				const hasMp3 = await mp3Exists(id);
				if (!hasMp3) {
					console.warn(`[recorder] orphan ${id} has no mp3, cleaning up`);
					await removeRecordingFiles(id);
					continue;
				}

				const objectId = new ObjectId(id);
				const doc = await findRecording(objectId);
				const startedAt = sidecar ? new Date(sidecar.startedAt) : (doc?.started_at ?? new Date());

				if (doc && doc.status === 'recording') {
					const endedAt = new Date();
					const durationSec = Math.max(
						0,
						Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000)
					);
					await markRecordingStopping(objectId, endedAt, durationSec);
				}

				await retryUpload({ id, startedAt });
			} catch (err) {
				console.error(`[recorder] orphan recovery failed for ${id}`, err);
			} finally {
				pending = Math.max(0, pending - 1);
			}
		}
	} finally {
		pending = 0;
		running = false;
	}
}
