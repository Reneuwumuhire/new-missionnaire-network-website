import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ENV } from './env.js';
export function mp3Path(id) {
    return path.join(ENV.RECORDINGS_DIR, `${id}.mp3`);
}
export function sidecarPath(id) {
    return path.join(ENV.RECORDINGS_DIR, `${id}.json`);
}
export function segmentMp3Path(id, n) {
    return path.join(ENV.RECORDINGS_DIR, `${id}.seg${n}.mp3`);
}
export function concatListPath(id) {
    return path.join(ENV.RECORDINGS_DIR, `${id}.list.txt`);
}
export async function ensureRecordingsDir() {
    await fs.mkdir(ENV.RECORDINGS_DIR, { recursive: true });
}
export async function writeSidecar(data) {
    await fs.writeFile(sidecarPath(data.id), JSON.stringify(data, null, 2), 'utf8');
}
export async function readSidecar(id) {
    try {
        const raw = await fs.readFile(sidecarPath(id), 'utf8');
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
/** Merge `patch` into the existing sidecar on disk. No-op if missing. */
export async function updateSidecar(id, patch) {
    const current = await readSidecar(id);
    if (!current)
        return;
    await writeSidecar({ ...current, ...patch });
}
export async function listOrphanIds() {
    await ensureRecordingsDir();
    const entries = await fs.readdir(ENV.RECORDINGS_DIR);
    return entries.filter((n) => n.endsWith('.json')).map((n) => n.replace(/\.json$/, ''));
}
/** Remove every file we may have written for this recording: canonical mp3,
 *  sidecar, all `.seg{N}.mp3` segments, and the `.list.txt` concat manifest. */
export async function removeRecordingFiles(id) {
    try {
        const entries = await fs.readdir(ENV.RECORDINGS_DIR);
        const matching = entries.filter((n) => n === `${id}.mp3` ||
            n === `${id}.json` ||
            n === `${id}.list.txt` ||
            n.startsWith(`${id}.seg`));
        await Promise.allSettled(matching.map((n) => fs.unlink(path.join(ENV.RECORDINGS_DIR, n))));
    }
    catch {
        // Directory missing or unreadable — nothing to clean.
    }
}
export async function mp3Exists(id) {
    try {
        await fs.access(mp3Path(id));
        return true;
    }
    catch {
        return false;
    }
}
export async function fileExists(p) {
    try {
        await fs.access(p);
        return true;
    }
    catch {
        return false;
    }
}
