import { ObjectId } from 'mongodb';
import { findRecording, markRecordingStopping } from './mongo.js';
import { listOrphanIds, mp3Exists, mp3Path, readSidecar, removeRecordingFiles } from './sidecar.js';
import { retryUpload } from './ffmpeg.js';
import { probeDurationSec } from './probe.js';
import { concatSegments, existingSegments } from './concat.js';
let pending = 0;
let running = false;
export function pendingOrphans() {
    return pending;
}
export function isRecovering() {
    return running;
}
async function recoverOne(id) {
    if (!ObjectId.isValid(id)) {
        console.warn(`[recorder] skipping orphan with invalid id: ${id}`);
        await removeRecordingFiles(id);
        return;
    }
    const sidecar = await readSidecar(id);
    // Multi-segment orphan: if the sidecar lists segments and the canonical
    // {id}.mp3 doesn't exist yet, concat the surviving segments first. This
    // covers the case where the recorder crashed mid-broadcast after one or
    // more auto-restarts wrote multiple segment files.
    if (sidecar?.segments && sidecar.segments.length > 0 && !(await mp3Exists(id))) {
        const survivors = await existingSegments(sidecar.segments);
        if (survivors.length === 0) {
            console.warn(`[recorder] orphan ${id} has segments listed but none exist on disk`);
            await removeRecordingFiles(id);
            return;
        }
        try {
            await concatSegments(id, survivors);
            console.log(`[recorder] orphan ${id} concat: ${survivors.length}/${sidecar.segments.length} segments recovered`);
        }
        catch (err) {
            console.error(`[recorder] orphan ${id} concat failed`, err);
            // Bail out — leave files on disk for manual recovery.
            return;
        }
    }
    if (!(await mp3Exists(id))) {
        console.warn(`[recorder] orphan ${id} has no mp3, cleaning up`);
        await removeRecordingFiles(id);
        return;
    }
    const objectId = new ObjectId(id);
    const doc = await findRecording(objectId);
    const startedAt = sidecar ? new Date(sidecar.startedAt) : (doc?.started_at ?? new Date());
    if (doc?.status === 'recording') {
        await finalizeOrphanDuration(id, objectId, startedAt);
    }
    await retryUpload({ id, startedAt });
}
async function finalizeOrphanDuration(id, objectId, startedAt) {
    const endedAt = new Date();
    const wallClockSec = Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));
    const probedSec = await probeDurationSec(mp3Path(id));
    const durationSec = probedSec ?? wallClockSec;
    if (probedSec !== null && wallClockSec - probedSec > 30) {
        console.warn(`[recorder] orphan ${id} audio is ${wallClockSec - probedSec}s shorter than wall clock (probed=${probedSec}s, wall=${wallClockSec}s)`);
    }
    await markRecordingStopping(objectId, endedAt, durationSec);
}
export async function recoverOrphans() {
    if (running)
        return;
    running = true;
    try {
        const ids = await listOrphanIds();
        pending = ids.length;
        if (ids.length === 0)
            return;
        console.log(`[recorder] recovering ${ids.length} orphan recording(s)`);
        for (const id of ids) {
            try {
                await recoverOne(id);
            }
            catch (err) {
                console.error(`[recorder] orphan recovery failed for ${id}`, err);
            }
            finally {
                pending = Math.max(0, pending - 1);
            }
        }
    }
    finally {
        pending = 0;
        running = false;
    }
}
