import { createHash, randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';

export const collections = ['sermons', 'literature', 'pdfs', 'recordings'];
const revisionFields = [
	'pdf_url',
	'english_pdf_url',
	'url',
	'subtitle_srt_url',
	'subtitle_srt_s3_key',
	'subtitle_offset_into_recording_ms',
	'subtitles_hidden',
	'published',
	'status',
	'recordingId',
	'updatedAt',
	'updated_at',
	'uploadDate'
];
const projection = {
	...Object.fromEntries(
		[...revisionFields, 'title', 'french_title', 'filename'].map((key) => [key, 1])
	),
	library_search: {
		$map: {
			input: { $ifNull: ['$library_search', []] },
			as: 'asset',
			in: {
				url: '$$asset.url',
				indexed_at: '$$asset.indexed_at',
				revision: '$$asset.revision',
				part_count: { $size: { $ifNull: ['$$asset.parts', []] } }
			}
		}
	}
};
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const publicRow = (row) =>
	row &&
	row.published !== false &&
	!['draft', 'scheduled', 'archived', 'private'].includes(row.status);
const publicRecording = (row) => row?.published === true && row.status === 'ready';

function assetsFor(collection, row, owner, scheduled) {
	if (!publicRow(row)) return [];
	if (collection === 'pdfs' && row.recordingId && !publicRecording(owner)) return [];
	if (collection === 'recordings' && (!publicRecording(row) || row.subtitles_hidden === true))
		return [];
	const direct = row.subtitle_srt_s3_key && Number.isFinite(row.subtitle_offset_into_recording_ms);
	const urls =
		collection === 'sermons'
			? [row.pdf_url, row.english_pdf_url]
			: collection === 'literature'
				? [row.pdf_url]
				: collection === 'recordings'
					? [direct ? row.subtitle_srt_url : scheduled?.subtitle_srt_url]
					: [row.url];
	const snapshot = Object.fromEntries(revisionFields.map((key) => [key, row[key] ?? null]));
	// ponytail: source timestamps conservatively re-index after metadata edits too;
	// use dedicated asset revisions if that extra work becomes significant.
	return [...new Set(urls.filter((url) => typeof url === 'string' && url))].map((url) => ({
		_id: hash([collection, String(row._id), url]),
		collection,
		sourceId: row._id,
		url,
		title: row.french_title || row.title || row.filename || String(row._id),
		kind: collection === 'recordings' ? 'srt' : 'pdf',
		revision: hash([
			snapshot,
			collection === 'recordings' && !direct
				? [scheduled?.subtitle_srt_url ?? null, scheduled?.updated_at ?? null]
				: null
		]),
		snapshot,
		changedAt: Math.max(
			0,
			...[
				row.updatedAt,
				row.updated_at,
				row.uploadDate,
				collection === 'recordings' && !direct ? scheduled?.updated_at : null
			].map((value) => new Date(value ?? 0).getTime() || 0)
		)
	}));
}

async function currentAssets(db, collection, sourceId) {
	const row = await db.collection(collection).findOne({ _id: sourceId }, { projection });
	if (!row) return [];
	const ownerId = String(row.recordingId ?? '');
	const owner =
		collection === 'pdfs' && ObjectId.isValid(ownerId)
			? await db
					.collection('recordings')
					.findOne({ _id: new ObjectId(ownerId) }, { projection: { published: 1, status: 1 } })
			: null;
	const scheduled =
		collection === 'recordings'
			? await db
					.collection('scheduled_lives')
					.findOne(
						{ recording_id: String(sourceId) },
						{ projection: { subtitle_srt_url: 1, updated_at: 1 } }
					)
			: null;
	return assetsFor(collection, row, owner, scheduled);
}

/** Metadata-only discovery covers admin, Studio and import uploads alike. */
export async function discover(db, now = new Date()) {
	const jobs = db.collection('library_index_jobs');
	const previous = new Map((await jobs.find({}).toArray()).map((job) => [job._id, job]));
	const recordings = new Map(
		(
			await db
				.collection('recordings')
				.find({}, { projection: { published: 1, status: 1 } })
				.toArray()
		).map((row) => [String(row._id), row])
	);
	const scheduled = new Map(
		(
			await db
				.collection('scheduled_lives')
				.find({}, { projection: { recording_id: 1, subtitle_srt_url: 1, updated_at: 1 } })
				.toArray()
		).map((row) => [String(row.recording_id), row])
	);
	const active = [];
	const operations = [];
	for (const collection of collections) {
		for await (const row of db.collection(collection).find({}, { projection })) {
			for (const asset of assetsFor(
				collection,
				row,
				recordings.get(String(row.recordingId)),
				scheduled.get(String(row._id))
			)) {
				active.push(asset._id);
				const old = previous.get(asset._id);
				const indexed = row.library_search?.find((item) => item.url === asset.url);
				if (
					old?.revision === asset.revision &&
					(indexed || !['ready', 'no_text'].includes(old.status))
				)
					continue;
				const ready =
					indexed &&
					(indexed.revision === asset.revision ||
						(!old &&
							!indexed.revision &&
							new Date(indexed.indexed_at).getTime() >= asset.changedAt));
				const { snapshot, changedAt, ...job } = asset;
				// Do not serve a previously extracted copy of a replaced same-URL file.
				if (indexed && !ready)
					await db
						.collection(collection)
						.updateOne(
							{ _id: row._id, ...snapshot },
							{ $pull: { library_search: { url: asset.url } } }
						);
				operations.push({
					updateOne: {
						filter: { _id: asset._id, ...(old ? { revision: old.revision } : {}) },
						update: {
							$set: {
								...job,
								status: ready ? (indexed.part_count ? 'ready' : 'no_text') : 'pending',
								attempts: 0,
								updatedAt: now,
								availableAt: now,
								error: null,
								lease: null
							},
							$setOnInsert: { createdAt: now }
						},
						upsert: !old
					}
				});
			}
		}
	}
	if (operations.length) await jobs.bulkWrite(operations, { ordered: false });
	// Only derived queue records; never delete source files or their publication data.
	await jobs.deleteMany({ _id: { $nin: active } });
	return active.length;
}

/** Atomic leases make restarts and multiple deployment replicas safe. */
export async function processOne(db, extract, now = new Date()) {
	const jobs = db.collection('library_index_jobs');
	await jobs.updateMany(
		{ status: 'processing', availableAt: { $lte: now }, attempts: { $gte: 3 } },
		{
			$set: {
				status: 'failed',
				lease: null,
				updatedAt: now,
				error: 'Extraction interrupted three times'
			}
		}
	);
	const lease = randomUUID();
	const job = await jobs.findOneAndUpdate(
		{
			$or: [
				{ status: 'pending', availableAt: { $lte: now } },
				{ status: 'processing', availableAt: { $lte: now } }
			]
		},
		{
			$set: {
				status: 'processing',
				lease,
				updatedAt: now,
				availableAt: new Date(now.getTime() + 120_000)
			},
			$inc: { attempts: 1 }
		},
		{ sort: { availableAt: 1, _id: 1 }, returnDocument: 'after' }
	);
	if (!job) return false;
	const owned = { _id: job._id, revision: job.revision, lease };
	try {
		const current = (await currentAssets(db, job.collection, job.sourceId)).find(
			(asset) => asset._id === job._id && asset.revision === job.revision
		);
		if (!current) {
			await jobs.deleteOne(owned);
			return true;
		}
		const asset = await extract(job.url, job.kind);
		const latest = (await currentAssets(db, job.collection, job.sourceId)).find(
			(asset) => asset._id === job._id && asset.revision === job.revision
		);
		if (!latest || !(await jobs.findOne(owned, { projection: { _id: 1 } }))) {
			await jobs.deleteOne(owned);
			return true;
		}
		const result = await db
			.collection(job.collection)
			.updateOne({ _id: job.sourceId, ...latest.snapshot }, [
				{
					$set: {
						library_search: {
							$concatArrays: [
								{
									$filter: {
										input: { $ifNull: ['$library_search', []] },
										as: 'asset',
										cond: { $ne: ['$$asset.url', { $literal: job.url }] }
									}
								},
								{ $literal: [{ ...asset, url: job.url, revision: job.revision }] }
							]
						}
					}
				}
			]);
		if (!result.matchedCount) {
			await jobs.deleteOne(owned);
			return true;
		}
		await jobs.updateOne(owned, {
			$set: {
				status: asset.parts.length ? 'ready' : 'no_text',
				updatedAt: new Date(),
				error: null,
				lease: null
			}
		});
	} catch (error) {
		await jobs.updateOne(owned, {
			$set: {
				status: job.attempts < 3 ? 'pending' : 'failed',
				availableAt: new Date(Date.now() + job.attempts * 60_000),
				updatedAt: new Date(),
				// Extractor messages never include credentials/URLs or response bodies.
				error: String(error.message || 'Extraction failed').slice(0, 300),
				lease: null
			}
		});
	}
	return true;
}
