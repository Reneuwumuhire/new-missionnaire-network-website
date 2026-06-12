/**
 * Scan the `recordings` collection (and `broadcast_admin_state`) for thumbnail
 * references whose underlying S3 object no longer exists, and clear those
 * references so the public site's placeholder kicks in cleanly.
 *
 * Why: before isThumbnailS3KeyReferenced gated the delete paths, replacing the
 * default/live broadcast thumbnail (or editing a per-recording thumbnail) would
 * delete the shared S3 object even though many other rows still referenced it.
 * Vercel's image proxy caches optimized variants for a long time so prod
 * usually still serves the image — but localhost (and prod once the cache
 * expires) 502s on the missing origin.
 *
 * Usage:
 *   MONGODB_URI="mongodb+srv://..." \
 *   AWS_S3_BUCKET="..." AWS_S3_REGION="..." \
 *   AWS_ACCESS_KEY_ID="..." AWS_SECRET_ACCESS_KEY="..." \
 *   npx tsx scripts/cleanup-orphan-thumbnails.ts [--dry-run]
 *
 *   --dry-run   Report what would be cleared without writing.
 */

import { MongoClient, ObjectId, ServerApiVersion } from 'mongodb';
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';

interface CliFlags {
	dryRun: boolean;
}

function parseFlags(): CliFlags {
	return {
		dryRun: process.argv.includes('--dry-run')
	};
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		console.error(`Error: ${name} environment variable is required`);
		process.exit(1);
	}
	return value;
}

interface RecordingRef {
	_id: ObjectId;
	thumbnail_s3_key: string;
	thumbnail_url: string | null;
}

interface ProbeResult {
	key: string;
	alive: boolean;
	/** Non-404 errors (e.g. 403, network) — surfaced separately so we never
	 *  clear a row whose key might actually still exist. */
	unknown: boolean;
}

async function probeKey(s3: S3Client, bucket: string, key: string): Promise<ProbeResult> {
	try {
		await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
		return { key, alive: true, unknown: false };
	} catch (err) {
		const status =
			(err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode ?? 0;
		const name = (err as Error).name;
		// 404 / NotFound / NoSuchKey are the definitive "deleted" signals.
		if (status === 404 || name === 'NotFound' || name === 'NoSuchKey') {
			return { key, alive: false, unknown: false };
		}
		console.warn(`  ! HEAD ${key} failed (${name}, status ${status}) — skipping for safety`);
		return { key, alive: false, unknown: true };
	}
}

async function probeKeysInBatches(
	s3: S3Client,
	bucket: string,
	keys: string[],
	concurrency = 8
): Promise<Map<string, ProbeResult>> {
	const results = new Map<string, ProbeResult>();
	let cursor = 0;
	async function worker() {
		while (cursor < keys.length) {
			const i = cursor++;
			const key = keys[i];
			const result = await probeKey(s3, bucket, key);
			results.set(key, result);
			if ((i + 1) % 25 === 0 || i + 1 === keys.length) {
				console.log(`  probed ${i + 1}/${keys.length}`);
			}
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, keys.length) }, worker));
	return results;
}

async function main() {
	const { dryRun } = parseFlags();
	const uri = requireEnv('MONGODB_URI');
	const bucket = requireEnv('AWS_S3_BUCKET');
	const region = requireEnv('AWS_S3_REGION');
	const accessKeyId = requireEnv('AWS_ACCESS_KEY_ID');
	const secretAccessKey = requireEnv('AWS_SECRET_ACCESS_KEY');

	const mongo = new MongoClient(uri, {
		serverApi: { version: ServerApiVersion.v1, strict: false, deprecationErrors: true }
	});
	const s3 = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });

	console.log(dryRun ? '── DRY RUN ──' : '── LIVE RUN ──');

	try {
		await mongo.connect();
		const db = mongo.db('youtube_data');
		const recordings = db.collection('recordings');
		const broadcast = db.collection('broadcast_admin_state');

		const refs = (await recordings
			.find({ thumbnail_s3_key: { $type: 'string', $ne: '' } })
			.project({ thumbnail_s3_key: 1, thumbnail_url: 1 })
			.toArray()) as unknown as RecordingRef[];

		const broadcastDoc = await broadcast.findOne({
			_id: 'current' as unknown as ObjectId
		});
		const broadcastKeys = {
			live: (broadcastDoc?.thumbnail_s3_key as string | null) ?? null,
			default: (broadcastDoc?.default_thumbnail_s3_key as string | null) ?? null
		};

		const uniqueKeys = new Set<string>(refs.map((r) => r.thumbnail_s3_key));
		if (broadcastKeys.live) uniqueKeys.add(broadcastKeys.live);
		if (broadcastKeys.default) uniqueKeys.add(broadcastKeys.default);

		console.log(
			`Found ${refs.length} recordings referencing ${uniqueKeys.size} unique thumbnail keys.`
		);
		console.log(
			`Broadcast state: live=${broadcastKeys.live ?? '(none)'} default=${broadcastKeys.default ?? '(none)'}`
		);

		if (uniqueKeys.size === 0) {
			console.log('Nothing to probe. Done.');
			return;
		}

		console.log('Probing S3…');
		const probes = await probeKeysInBatches(s3, bucket, [...uniqueKeys]);

		const deadKeys = new Set<string>();
		let unknownCount = 0;
		for (const probe of probes.values()) {
			if (!probe.alive && !probe.unknown) deadKeys.add(probe.key);
			if (probe.unknown) unknownCount++;
		}

		console.log(
			`Alive: ${uniqueKeys.size - deadKeys.size - unknownCount}, Dead: ${deadKeys.size}, Unknown: ${unknownCount}`
		);

		if (deadKeys.size === 0) {
			console.log('No orphan references to clear. Done.');
			return;
		}

		const affectedRecordings = refs.filter((r) => deadKeys.has(r.thumbnail_s3_key));
		console.log(
			`Will clear thumbnail_url + thumbnail_s3_key on ${affectedRecordings.length} recordings.`
		);

		const broadcastNeedsClear: Array<'thumbnail' | 'default_thumbnail'> = [];
		if (broadcastKeys.live && deadKeys.has(broadcastKeys.live)) {
			broadcastNeedsClear.push('thumbnail');
		}
		if (broadcastKeys.default && deadKeys.has(broadcastKeys.default)) {
			broadcastNeedsClear.push('default_thumbnail');
		}
		if (broadcastNeedsClear.length > 0) {
			console.log(`Will clear on broadcast_admin_state: ${broadcastNeedsClear.join(', ')}`);
		}

		if (dryRun) {
			console.log('Dry run complete — no writes performed.');
			return;
		}

		if (affectedRecordings.length > 0) {
			const ids = affectedRecordings.map((r) => r._id);
			const res = await recordings.updateMany(
				{ _id: { $in: ids } },
				{ $set: { thumbnail_url: null, thumbnail_s3_key: null, updated_at: new Date() } }
			);
			console.log(`recordings: cleared ${res.modifiedCount} rows.`);
		}

		if (broadcastNeedsClear.length > 0) {
			const set: Record<string, null | string> = { updated_at: new Date().toISOString() };
			if (broadcastNeedsClear.includes('thumbnail')) {
				set.thumbnail_url = null;
				set.thumbnail_s3_key = null;
			}
			if (broadcastNeedsClear.includes('default_thumbnail')) {
				set.default_thumbnail_url = null;
				set.default_thumbnail_s3_key = null;
			}
			await broadcast.updateOne({ _id: 'current' as unknown as ObjectId }, { $set: set });
			console.log('broadcast_admin_state: cleared dead thumbnail field(s).');
		}

		console.log('Done.');
	} finally {
		await mongo.close();
		s3.destroy();
	}
}

main().catch((err) => {
	console.error('Cleanup failed:', err);
	process.exit(1);
});
