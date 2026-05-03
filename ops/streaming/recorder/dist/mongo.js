import { MongoClient, ServerApiVersion } from 'mongodb';
import { ENV } from './env.js';
let client = null;
let dbPromise = null;
async function connect() {
    if (!client) {
        client = new MongoClient(ENV.MONGODB_URI, {
            serverApi: { version: ServerApiVersion.v1, strict: false, deprecationErrors: true },
            maxPoolSize: 5,
            serverSelectionTimeoutMS: 5000
        });
        await client.connect();
        console.log('[recorder/mongo] connected');
    }
    return client.db(ENV.MONGODB_DB);
}
export function getDb() {
    if (!dbPromise)
        dbPromise = connect();
    return dbPromise;
}
export async function getBroadcastSnapshot() {
    try {
        const db = await getDb();
        const doc = (await db
            .collection('broadcast_admin_state')
            .findOne({ _id: 'current' }));
        return {
            title: doc?.title ?? null,
            description: doc?.description ?? null,
            thumbnail_url: doc?.thumbnail_url ?? null
        };
    }
    catch (err) {
        console.error('[recorder/mongo] failed to read broadcast snapshot:', err);
        return { title: null, description: null, thumbnail_url: null };
    }
}
export async function insertRecordingStarting(params) {
    const db = await getDb();
    await db.collection('recordings').insertOne({
        _id: params.id,
        title: params.title,
        started_at: params.startedAt,
        ended_at: null,
        duration_sec: null,
        s3_key: null,
        s3_url: null,
        size_bytes: null,
        status: 'recording',
        published: false,
        created_by: params.createdBy,
        created_by_name: params.createdByName ?? null,
        failure_reason: null,
        thumbnail_url: null,
        description: null,
        peaks: null,
        peaks_duration_sec: null,
        updated_at: new Date()
    });
}
export async function markRecordingStopping(id, endedAt, durationSec) {
    const db = await getDb();
    await db
        .collection('recordings')
        .updateOne({ _id: id }, { $set: { status: 'uploading', ended_at: endedAt, duration_sec: durationSec, updated_at: new Date() } });
}
export async function markRecordingReady(id, params) {
    const db = await getDb();
    const setOps = {
        status: 'ready',
        s3_key: params.s3Key,
        s3_url: params.s3Url,
        size_bytes: params.sizeBytes,
        thumbnail_url: params.thumbnailUrl,
        description: params.description,
        peaks: params.peaks,
        peaks_duration_sec: params.peaksDurationSec,
        failure_reason: null,
        updated_at: new Date()
    };
    // Only override the default title if admin set a broadcast-level title.
    if (params.title)
        setOps.title = params.title;
    await db.collection('recordings').updateOne({ _id: id }, { $set: setOps });
}
export async function markRecordingFailed(id, reason) {
    const db = await getDb();
    await db
        .collection('recordings')
        .updateOne({ _id: id }, { $set: { status: 'failed', failure_reason: reason, updated_at: new Date() } });
}
export async function findRecording(id) {
    const db = await getDb();
    return (await db.collection('recordings').findOne({ _id: id })) ?? null;
}
