/** Repair legacy PDF URLs whose filename no longer names the existing S3 object.
 * Dry-run by default; pass --write to update MongoDB. */
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { MongoClient, ObjectId } from 'mongodb';
import { pathToFileURL } from 'node:url';

const args = new Set(process.argv.slice(2));
const write = args.delete('--write');
if (args.size) throw new Error('Usage: node scripts/repair-library-asset-urls.mjs [--write]');

const decode = (value) => {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
};

export const comparableFilename = (value) => {
	let result = decode(value);
	if (/[ÃÂÌ]/.test(result)) result = Buffer.from(result, 'latin1').toString('utf8');
	return result.normalize('NFC');
};

const objectKeyFromUrl = (value) => {
	const slash = value.indexOf('/', value.indexOf('://') + 3);
	return decode(value.slice(slash + 1));
};

export const s3Url = (bucket, region, key) =>
	`https://${bucket}.s3.${region}.amazonaws.com/${key.split('/').map(encodeURIComponent).join('/')}`;

async function repair() {
	for (const name of [
		'MONGODB_URI',
		'AWS_S3_BUCKET',
		'AWS_S3_REGION',
		'AWS_ACCESS_KEY_ID',
		'AWS_SECRET_ACCESS_KEY'
	])
		if (!process.env[name]) throw new Error(`${name} is required`);
	const bucket = process.env.AWS_S3_BUCKET;
	const region = process.env.AWS_S3_REGION;
	const s3 = new S3Client({
		region,
		credentials: {
			accessKeyId: process.env.AWS_ACCESS_KEY_ID,
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
		}
	});
	const mongo = new MongoClient(process.env.MONGODB_URI);
	let repaired = 0,
		ambiguous = 0;
	try {
		await mongo.connect();
		const db = mongo.db(process.env.MONGODB_DB || 'youtube_data');
		const jobs = await db
			.collection('library_index_jobs')
			.find({ collection: 'pdfs', status: 'failed', error: 'Asset request failed (403)' })
			.toArray();
		for (const sourceId of new Set(jobs.map((job) => String(job.sourceId)))) {
			const row = await db.collection('pdfs').findOne({ _id: new ObjectId(sourceId) });
			if (!row?.url) continue;
			const oldKey = objectKeyFromUrl(row.url);
			const directory = oldKey.split('/').slice(0, -1).join('/');
			const filename = oldKey.split('/').at(-1);
			const date = (row.filename || filename).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
			if (!date) continue;
			const directories = new Set([directory, directory.replace(/^pdfs\//, 'pdf/')]);
			const candidates = (
				await Promise.all(
					[...directories].map((prefix) =>
						s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `${prefix}/${date}` }))
					)
				)
			).flatMap((listed) => (listed.Contents || []).map((item) => item.Key));
			const exact = candidates.filter(
				(key) => comparableFilename(key.split('/').at(-1)) === comparableFilename(filename)
			);
			const matches = exact.length ? exact : candidates;
			if (matches.length !== 1) {
				ambiguous++;
				console.error(`${row.filename}: ${matches.length || 'no'} matching S3 objects`);
				continue;
			}
			const key = matches[0];
			console.log(`${row.filename}\n  → ${key.split('/').at(-1)}`);
			if (write)
				await db.collection('pdfs').updateOne(
					{ _id: row._id, url: row.url },
					{
						$set: {
							filename: key.split('/').at(-1),
							url: s3Url(bucket, region, key),
							updatedAt: new Date()
						}
					}
				);
			repaired++;
		}
	} finally {
		await mongo.close();
	}
	console.log(`\n${write ? 'Repaired' : 'Dry run'}: ${repaired} URLs, ${ambiguous} unresolved.`);
	if (ambiguous) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await repair();
