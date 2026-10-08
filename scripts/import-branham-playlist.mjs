import { createReadStream, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { MongoClient } from 'mongodb';

const directory = '.song-archive/branham-playlist';
const playlistId = 'PLQea2ssRcPE1ARbfWjAL4j3M8KRE7FQWP';
const category = 'William Marrion Branham';
const write = process.argv.includes('--write');
const titles = JSON.parse(readFileSync('content/branham-song-titles.json', 'utf8'));
const entries = readFileSync(join(directory, 'playlist-entries.jsonl'), 'utf8')
	.trim()
	.split('\n')
	.map(JSON.parse);
const ids = [...new Set(entries.map((entry) => entry.id))];
if (ids.some((id) => !/^[A-Za-z0-9_-]{11}$/.test(id))) throw new Error('Invalid YouTube video ID');
if (ids.some((id) => typeof titles[id] !== 'string' || !titles[id].trim()))
	throw new Error('A reviewed song title is missing');
const missing = ids.filter((id) => !existsSync(join(directory, `${id}.mp3`)));
if (missing.length)
	throw new Error(`${missing.length} MP3 files are missing: ${missing.join(', ')}`);
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
if (write)
	for (const name of [
		'AWS_ACCESS_KEY_ID',
		'AWS_SECRET_ACCESS_KEY',
		'AWS_S3_BUCKET',
		'AWS_S3_REGION'
	])
		if (!process.env[name]) throw new Error(`${name} is required with --write`);

const mongo = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
try {
	await mongo.connect();
	const collection = mongo.db(process.env.MONGODB_DB || 'youtube_data').collection('music_audio');
	const existingDocs = await collection
		.find({ youtube_id: { $in: ids } }, { projection: { youtube_id: 1, title: 1 } })
		.toArray();
	const existing = new Set(existingDocs.map((doc) => doc.youtube_id));
	const pending = ids.filter((id) => !existing.has(id));
	const titlesToFix = existingDocs.filter((doc) => doc.title !== titles[doc.youtube_id]);
	console.log(
		`${ids.length} unique videos; ${existing.size} already imported; ${pending.length} pending; ${titlesToFix.length} titles to fix`
	);
	if (!write) {
		console.log('Dry run. Pass --write to upload MP3s and add them to Music.');
	} else {
		const bucket = process.env.AWS_S3_BUCKET;
		const region = process.env.AWS_S3_REGION;
		const s3 = new S3Client({
			region,
			credentials: {
				accessKeyId: process.env.AWS_ACCESS_KEY_ID,
				secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
			},
			requestChecksumCalculation: 'WHEN_REQUIRED'
		});
		for (const doc of titlesToFix) {
			await collection.updateOne(
				{ _id: doc._id, title: doc.title },
				{
					$set: {
						title: titles[doc.youtube_id],
						updated_at: new Date(),
						updated_by: 'playlist-import'
					}
				}
			);
			await mongo
				.db(process.env.MONGODB_DB || 'youtube_data')
				.collection('audit_log')
				.insertOne({
					user_id: 'playlist-import',
					user_email: 'playlist-import',
					action: 'update',
					target_collection: 'music_audio',
					target_id: doc._id.toString(),
					target_ids: null,
					changes: { title: { old: doc.title, new: titles[doc.youtube_id] } },
					ip_address: null,
					timestamp: new Date()
				});
		}
		for (const id of pending.reverse()) {
			const metadata = JSON.parse(readFileSync(join(directory, `${id}.info.json`), 'utf8'));
			const file = join(directory, `${id}.mp3`);
			const fileSize = statSync(file).size;
			if (!metadata.title || fileSize === 0) throw new Error(`Invalid song data for ${id}`);
			const key = `music-audio/${category}/${id}.mp3`;
			await s3.send(
				new PutObjectCommand({
					Bucket: bucket,
					Key: key,
					Body: createReadStream(file),
					ContentLength: fileSize,
					ContentType: 'audio/mpeg'
				})
			);
			const result = await collection.insertOne({
				title: titles[id],
				artist: null,
				category,
				book: null,
				book_full_name: null,
				number: null,
				s3_key: key,
				s3_url: `https://${bucket}.s3.${region}.amazonaws.com/${key.split('/').map(encodeURIComponent).join('/')}`,
				file_size: fileSize,
				duration: metadata.duration ?? null,
				format: 'mp3',
				uploaded_at: new Date(),
				uploaded_by: 'playlist-import',
				youtube_id: id,
				source_url: `https://www.youtube.com/watch?v=${id}`,
				source_playlist: playlistId,
				playlist_position: ids.indexOf(id) + 1
			});
			await mongo
				.db(process.env.MONGODB_DB || 'youtube_data')
				.collection('audit_log')
				.insertOne({
					user_id: 'playlist-import',
					user_email: 'playlist-import',
					action: 'create',
					target_collection: 'music_audio',
					target_id: result.insertedId.toString(),
					target_ids: null,
					changes: null,
					ip_address: null,
					timestamp: new Date()
				});
			console.log(`Imported ${id}`);
		}
	}
} finally {
	await mongo.close();
}
