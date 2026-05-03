import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ENV } from './env.js';

export interface Sidecar {
	id: string;
	title: string;
	startedAt: string; // ISO
	createdBy: string;
	createdByName?: string | null;
	/** Absolute paths of every segment captured so far, in chronological
	 *  order. Present only for multi-segment recordings (i.e. ones that hit
	 *  an unexpected ffmpeg exit and auto-restarted). Used by orphan
	 *  recovery to concat survivors before upload after a crash/restart. */
	segments?: string[];
}

export function mp3Path(id: string): string {
	return path.join(ENV.RECORDINGS_DIR, `${id}.mp3`);
}

export function sidecarPath(id: string): string {
	return path.join(ENV.RECORDINGS_DIR, `${id}.json`);
}

export function segmentMp3Path(id: string, n: number): string {
	return path.join(ENV.RECORDINGS_DIR, `${id}.seg${n}.mp3`);
}

export function concatListPath(id: string): string {
	return path.join(ENV.RECORDINGS_DIR, `${id}.list.txt`);
}

export async function ensureRecordingsDir(): Promise<void> {
	await fs.mkdir(ENV.RECORDINGS_DIR, { recursive: true });
}

export async function writeSidecar(data: Sidecar): Promise<void> {
	await fs.writeFile(sidecarPath(data.id), JSON.stringify(data, null, 2), 'utf8');
}

export async function readSidecar(id: string): Promise<Sidecar | null> {
	try {
		const raw = await fs.readFile(sidecarPath(id), 'utf8');
		return JSON.parse(raw) as Sidecar;
	} catch {
		return null;
	}
}

/** Merge `patch` into the existing sidecar on disk. No-op if missing. */
export async function updateSidecar(id: string, patch: Partial<Sidecar>): Promise<void> {
	const current = await readSidecar(id);
	if (!current) return;
	await writeSidecar({ ...current, ...patch });
}

export async function listOrphanIds(): Promise<string[]> {
	await ensureRecordingsDir();
	const entries = await fs.readdir(ENV.RECORDINGS_DIR);
	return entries.filter((n) => n.endsWith('.json')).map((n) => n.replace(/\.json$/, ''));
}

/** Remove every file we may have written for this recording: canonical mp3,
 *  sidecar, all `.seg{N}.mp3` segments, and the `.list.txt` concat manifest. */
export async function removeRecordingFiles(id: string): Promise<void> {
	try {
		const entries = await fs.readdir(ENV.RECORDINGS_DIR);
		const matching = entries.filter(
			(n) =>
				n === `${id}.mp3` ||
				n === `${id}.json` ||
				n === `${id}.list.txt` ||
				n.startsWith(`${id}.seg`)
		);
		await Promise.allSettled(
			matching.map((n) => fs.unlink(path.join(ENV.RECORDINGS_DIR, n)))
		);
	} catch {
		// Directory missing or unreadable — nothing to clean.
	}
}

export async function mp3Exists(id: string): Promise<boolean> {
	try {
		await fs.access(mp3Path(id));
		return true;
	} catch {
		return false;
	}
}

export async function fileExists(p: string): Promise<boolean> {
	try {
		await fs.access(p);
		return true;
	} catch {
		return false;
	}
}
