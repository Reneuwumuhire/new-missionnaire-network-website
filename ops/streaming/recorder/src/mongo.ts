import { MongoClient, ObjectId, ServerApiVersion, type Db } from 'mongodb';
import { ENV } from './env.js';

let client: MongoClient | null = null;
let dbPromise: Promise<Db> | null = null;

async function connect(): Promise<Db> {
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

export function getDb(): Promise<Db> {
	if (!dbPromise) dbPromise = connect();
	return dbPromise;
}

export interface RecordingDoc {
	_id: ObjectId;
	title: string;
	started_at: Date;
	ended_at: Date | null;
	duration_sec: number | null;
	s3_key: string | null;
	s3_url: string | null;
	size_bytes: number | null;
	status: 'recording' | 'uploading' | 'ready' | 'failed';
	published: boolean;
	created_by: string;
	failure_reason: string | null;
	/** Snapshot of broadcast_admin_state.thumbnail_url at recording-save time. */
	thumbnail_url: string | null;
	/** Snapshot of broadcast_admin_state.description at recording-save time. */
	description: string | null;
	updated_at: Date;
}

/** Minimal shape of the broadcast admin state doc for snapshot reads. */
interface BroadcastAdminStateSnapshot {
	title: string | null;
	description: string | null;
	thumbnail_url: string | null;
}

export async function getBroadcastSnapshot(): Promise<BroadcastAdminStateSnapshot> {
	try {
		const db = await getDb();
		const doc = (await db
			.collection('broadcast_admin_state')
			.findOne({ _id: 'current' as unknown as ObjectId })) as BroadcastAdminStateSnapshot | null;
		return {
			title: doc?.title ?? null,
			description: doc?.description ?? null,
			thumbnail_url: doc?.thumbnail_url ?? null
		};
	} catch (err) {
		console.error('[recorder/mongo] failed to read broadcast snapshot:', err);
		return { title: null, description: null, thumbnail_url: null };
	}
}

export async function insertRecordingStarting(params: {
	id: ObjectId;
	title: string;
	startedAt: Date;
	createdBy: string;
}): Promise<void> {
	const db = await getDb();
	await db.collection<RecordingDoc>('recordings').insertOne({
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
		failure_reason: null,
		thumbnail_url: null,
		description: null,
		updated_at: new Date()
	});
}

export async function markRecordingStopping(id: ObjectId, endedAt: Date, durationSec: number) {
	const db = await getDb();
	await db
		.collection<RecordingDoc>('recordings')
		.updateOne(
			{ _id: id },
			{ $set: { status: 'uploading', ended_at: endedAt, duration_sec: durationSec, updated_at: new Date() } }
		);
}

export async function markRecordingReady(
	id: ObjectId,
	params: {
		s3Key: string;
		s3Url: string;
		sizeBytes: number;
		thumbnailUrl: string | null;
		title: string | null;
		description: string | null;
	}
) {
	const db = await getDb();
	const setOps: Partial<RecordingDoc> = {
		status: 'ready',
		s3_key: params.s3Key,
		s3_url: params.s3Url,
		size_bytes: params.sizeBytes,
		thumbnail_url: params.thumbnailUrl,
		description: params.description,
		failure_reason: null,
		updated_at: new Date()
	};
	// Only override the default title if admin set a broadcast-level title.
	if (params.title) setOps.title = params.title;
	await db.collection<RecordingDoc>('recordings').updateOne({ _id: id }, { $set: setOps });
}

export async function markRecordingFailed(id: ObjectId, reason: string) {
	const db = await getDb();
	await db
		.collection<RecordingDoc>('recordings')
		.updateOne({ _id: id }, { $set: { status: 'failed', failure_reason: reason, updated_at: new Date() } });
}

export async function findRecording(id: ObjectId): Promise<RecordingDoc | null> {
	const db = await getDb();
	return (await db.collection<RecordingDoc>('recordings').findOne({ _id: id })) ?? null;
}
