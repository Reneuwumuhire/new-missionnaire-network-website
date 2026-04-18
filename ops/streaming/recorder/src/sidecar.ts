import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ENV } from './env.js';

export interface Sidecar {
	id: string;
	title: string;
	startedAt: string; // ISO
	createdBy: string;
	createdByName?: string | null;
}

export function mp3Path(id: string): string {
	return path.join(ENV.RECORDINGS_DIR, `${id}.mp3`);
}

export function sidecarPath(id: string): string {
	return path.join(ENV.RECORDINGS_DIR, `${id}.json`);
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

export async function listOrphanIds(): Promise<string[]> {
	await ensureRecordingsDir();
	const entries = await fs.readdir(ENV.RECORDINGS_DIR);
	return entries.filter((n) => n.endsWith('.json')).map((n) => n.replace(/\.json$/, ''));
}

export async function removeRecordingFiles(id: string): Promise<void> {
	await Promise.allSettled([fs.unlink(mp3Path(id)), fs.unlink(sidecarPath(id))]);
}

export async function mp3Exists(id: string): Promise<boolean> {
	try {
		await fs.access(mp3Path(id));
		return true;
	} catch {
		return false;
	}
}
