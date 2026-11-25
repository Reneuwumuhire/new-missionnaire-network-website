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
	auto_publish_live_started_at?: string;
	created_by: string;
	created_by_name: string | null;
	failure_reason: string | null;
	/** Snapshot of broadcast_admin_state.thumbnail_url at recording-save time. */
	thumbnail_url: string | null;
	/** Snapshot of broadcast_admin_state.thumbnail_s3_key — needed so the admin
	 *  can later replace/delete the thumbnail without leaking the S3 object. */
	thumbnail_s3_key: string | null;
	/** Snapshot of broadcast_admin_state.description at recording-save time. */
	description: string | null;
	/** YouTube video id parsed from broadcast_admin_state.youtube_url at
	 *  recording-save time. Mirrors what admin PATCH stores. */
	source_video_id: string | null;
	/** Precomputed mono waveform peaks (0..1 magnitude, ~4000 bins). Set by
	 *  the recorder after upload and refreshed when the admin trims audio. */
	peaks: number[] | null;
	peaks_duration_sec: number | null;
	updated_at: Date;
}

/** Minimal shape of the broadcast admin state doc for snapshot reads. */
interface BroadcastAdminStateSnapshot {
	title: string | null;
	description: string | null;
	thumbnail_url: string | null;
	thumbnail_s3_key: string | null;
	youtube_url: string | null;
}

async function getLiveGate(db: Db) {
	return db
		.collection<{ _id: string; is_live?: boolean; is_test?: boolean; started_at?: string }>(
			'broadcast_admin_state'
		)
		.findOne({ _id: 'current' }, { projection: { is_live: 1, is_test: 1, started_at: 1 } });
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
			thumbnail_url: doc?.thumbnail_url ?? null,
			thumbnail_s3_key: doc?.thumbnail_s3_key ?? null,
			youtube_url: doc?.youtube_url ?? null
		};
	} catch (err) {
		console.error('[recorder/mongo] failed to read broadcast snapshot:', err);
		return {
			title: null,
			description: null,
			thumbnail_url: null,
			thumbnail_s3_key: null,
			youtube_url: null
		};
	}
}

export async function insertRecordingStarting(params: {
	id: ObjectId;
	title: string;
	startedAt: Date;
	createdBy: string;
	createdByName?: string | null;
}): Promise<void> {
	const db = await getDb();
	const live = await getLiveGate(db).catch((error) => {
		console.error('[recorder/mongo] could not check auto-publish eligibility:', error);
		return null;
	});
	const liveStartedAt = live?.started_at;
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
		...(live?.is_live === true &&
		live.is_test !== true &&
		liveStartedAt &&
		Date.parse(liveStartedAt) <= params.startedAt.getTime()
			? { auto_publish_live_started_at: liveStartedAt }
			: {}),
		created_by: params.createdBy,
		created_by_name: params.createdByName ?? null,
		failure_reason: null,
		thumbnail_url: null,
		thumbnail_s3_key: null,
		description: null,
		source_video_id: null,
		peaks: null,
		peaks_duration_sec: null,
		updated_at: new Date()
	});
}

export async function markRecordingStopping(id: ObjectId, endedAt: Date, durationSec: number) {
	const db = await getDb();
	await db.collection<RecordingDoc>('recordings').updateOne(
		{ _id: id },
		{
			$set: {
				status: 'uploading',
				ended_at: endedAt,
				duration_sec: durationSec,
				updated_at: new Date()
			}
		}
	);
}

export async function markRecordingReady(
	id: ObjectId,
	params: {
		s3Key: string;
		s3Url: string;
		sizeBytes: number;
		thumbnailUrl: string | null;
		thumbnailS3Key: string | null;
		title: string | null;
		description: string | null;
		sourceVideoId: string | null;
		peaks: number[] | null;
		peaksDurationSec: number | null;
	}
) {
	const db = await getDb();
	const setOps: Partial<RecordingDoc> = {
		status: 'ready',
		s3_key: params.s3Key,
		s3_url: params.s3Url,
		size_bytes: params.sizeBytes,
		thumbnail_url: params.thumbnailUrl,
		thumbnail_s3_key: params.thumbnailS3Key,
		description: params.description,
		source_video_id: params.sourceVideoId,
		peaks: params.peaks,
		peaks_duration_sec: params.peaksDurationSec,
		failure_reason: null,
		updated_at: new Date()
	};
	// Only override the default title if admin set a broadcast-level title.
	if (params.title) setOps.title = params.title;
	await db.collection<RecordingDoc>('recordings').updateOne({ _id: id }, { $set: setOps });
	await publishReadyLiveRecordings();
}

let publishing = false;

/** A session may still be live when its sermon recording finishes uploading. */
export async function publishReadyLiveRecordings(): Promise<void> {
	if (publishing) return;
	publishing = true;
	try {
		const db = await getDb();
		const recordings = db.collection<RecordingDoc>('recordings');
		const pending = {
			status: 'ready' as const,
			published: false,
			auto_publish_live_started_at: { $exists: true }
		};
		const eligible = await recordings.find(pending, { projection: { _id: 1 } }).toArray();
		if (eligible.length === 0) return;

		const live = await getLiveGate(db);
		if (!live || typeof live.is_live !== 'boolean' || (live.is_live && !live.started_at)) return;
		await recordings.updateMany(
			{
				...pending,
				_id: { $in: eligible.map((recording) => recording._id) },
				auto_publish_live_started_at: {
					$exists: true,
					...(live.is_live === true ? { $ne: live.started_at } : {})
				}
			},
			{
				$set: { published: true, updated_at: new Date() },
				$unset: { auto_publish_live_started_at: '' }
			}
		);
	} catch (error) {
		console.error('[recorder/mongo] automatic publication failed:', error);
	} finally {
		publishing = false;
	}
}

export async function markRecordingFailed(id: ObjectId, reason: string) {
	const db = await getDb();
	await db
		.collection<RecordingDoc>('recordings')
		.updateOne(
			{ _id: id },
			{ $set: { status: 'failed', failure_reason: reason, updated_at: new Date() } }
		);
}

export async function findRecording(id: ObjectId): Promise<RecordingDoc | null> {
	const db = await getDb();
	return (await db.collection<RecordingDoc>('recordings').findOne({ _id: id })) ?? null;
}

/** Revocations are written by the admin app into the shared database. Deny a
 * new publisher when that security state cannot be checked. */
export async function isIngestRevoked(path: string): Promise<boolean> {
	try {
		const doc = await (
			await getDb()
		)
			.collection<{ _id: string; expires_at: Date }>('studio_ingest_revocations')
			.findOne({ _id: path, expires_at: { $gt: new Date() } });
		return Boolean(doc);
	} catch (error) {
		console.error('[recorder/mongo] failed to check ingest revocation:', error);
		return true;
	}
}
