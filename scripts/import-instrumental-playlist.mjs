import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { MongoClient } from 'mongodb';

const directory = '.song-archive/instrumental-playlist';
const playlistId = 'PLOpV149mUpV858n5BYcIrec6YqirjvamD';
const write = process.argv.includes('--write');
const entries = JSON.parse(
	readFileSync(new URL('./data/hymns-on-piano-playlist.json', import.meta.url), 'utf8')
).filter((entry) => entry.privacyStatus === 'public');

if (entries.length !== new Set(entries.map((entry) => entry.id)).size)
	throw new Error('Playlist contains duplicate video IDs');
if (entries.some((entry) => !/^[A-Za-z0-9_-]{11}$/.test(entry.id)))
	throw new Error('Playlist contains an invalid video ID');
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');

const fileFor = (entry) => join(directory, `${entry.id}.mp3`);
const isReady = (entry) => {
	const file = fileFor(entry);
	return (
		existsSync(file) &&
		existsSync(join(directory, `${entry.id}.info.json`)) &&
		statSync(file).size > 0 &&
		Date.now() - statSync(file).mtimeMs > 60_000
	);
};
const missing = entries.filter((entry) => !isReady(entry));
if (missing.length) console.log(`${missing.length} recordings are not ready to upload yet`);
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
	const db = mongo.db(process.env.MONGODB_DB || 'youtube_data');
	const collection = db.collection('instrumental_audio');
	const existing = new Map(
		(
			await collection
				.find({ source_playlist: playlistId }, { projection: { youtube_id: 1, file_size: 1 } })
				.toArray()
		).map((document) => [document.youtube_id, document.file_size])
	);
	const ready = entries.filter(
		(entry) => isReady(entry) && existing.get(entry.id) !== statSync(fileFor(entry)).size
	);
	console.log(
		`${entries.length} public recordings; ${existing.size} already imported; ${ready.length} ready to upload or repair; ${missing.length} still not ready`
	);
	if (!write) {
		console.log(
			'Dry run. Pass --write to upload available MP3s to the separate Instrumental library.'
		);
	} else {
		await collection.createIndex({ youtube_id: 1 }, { unique: true });
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
		let completed = 0;
		let next = 0;
		const failures = [];
		const uploadNext = async () => {
			while (next < ready.length) {
				const entry = ready[next++];
				try {
					await uploadEntry(entry);
					completed++;
					if (completed % 10 === 0 || completed === ready.length)
						console.log(`${completed}/${ready.length} uploaded`);
				} catch (error) {
					failures.push(entry.id);
					console.error(`Failed to upload ${entry.id}:`, error);
				}
			}
		};
		const uploadEntry = async (entry) => {
			const file = fileFor(entry);
			const metadata = JSON.parse(readFileSync(join(directory, `${entry.id}.info.json`), 'utf8'));
			const fileSize = statSync(file).size;
			if (!fileSize || !metadata.title) throw new Error(`Invalid audio for ${entry.id}`);
			const key = `instrumental-audio/hymns-on-piano/${entry.id}.mp3`;
			for (let attempt = 1; attempt <= 3; attempt++) {
				try {
					await s3.send(
						new PutObjectCommand({
							Bucket: bucket,
							Key: key,
							Body: createReadStream(file),
							ContentLength: fileSize,
							ContentType: 'audio/mpeg'
						})
					);
					break;
				} catch (error) {
					if (attempt === 3) throw error;
					await new Promise((resolve) => setTimeout(resolve, attempt * 500));
				}
			}
			const title = String(entry.title)
				.replace(/\s+-\s+piano\b.*$/i, '')
				.trim();
			await collection.updateOne(
				{ youtube_id: entry.id },
				{
					$set: {
						title: title || entry.title,
						original_title: entry.title,
						artist: 'Kaleb Brasee',
						category: 'Instrumental',
						book: null,
						book_full_name: 'Hymns on Piano',
						number: null,
						s3_key: key,
						s3_url: `https://${bucket}.s3.${region}.amazonaws.com/${key}`,
						file_size: fileSize,
						duration: metadata.duration ?? null,
						format: 'mp3',
						uploaded_by: 'instrumental-playlist-import',
						youtube_id: entry.id,
						source_url: `https://www.youtube.com/watch?v=${entry.id}`,
						source_playlist: playlistId,
						playlist_position: entry.position + 1
					},
					$setOnInsert: { uploaded_at: new Date() }
				},
				{ upsert: true }
			);
		};
		await Promise.all(Array.from({ length: Math.min(8, ready.length) }, () => uploadNext()));
		if (failures.length)
			throw new Error(`${failures.length} uploads failed: ${failures.join(', ')}`);
	}
} finally {
	await mongo.close();
}
