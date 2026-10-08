import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';

const playlistId = 'PLQea2ssRcPE1ARbfWjAL4j3M8KRE7FQWP';
const transcripts = JSON.parse(readFileSync('content/branham-song-lyrics.json', 'utf8'));
const write = process.argv.includes('--write');

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
if (Object.values(transcripts).some((text) => typeof text !== 'string' || !text.trim())) {
	throw new Error('Every transcript must have text');
}

const mongo = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
try {
	await mongo.connect();
	const db = mongo.db(process.env.MONGODB_DB || 'youtube_data');
	const audio = await db
		.collection('music_audio')
		.find(
			{ source_playlist: playlistId },
			{ projection: { title: 1, category: 1, duration: 1, s3_key: 1, s3_url: 1, youtube_id: 1 } }
		)
		.toArray();
	const byVideoId = new Map(audio.map((song) => [song.youtube_id, song]));
	const unknown = Object.keys(transcripts).filter((id) => !byVideoId.has(id));
	if (unknown.length) throw new Error(`Unknown playlist videos: ${unknown.join(', ')}`);

	let existing = 0;
	let created = 0;
	for (const [videoId, text] of Object.entries(transcripts)) {
		const song = byVideoId.get(videoId);
		const audioId = song._id.toString();
		if (
			await db.collection('music_lyrics').findOne({ audio_id: audioId }, { projection: { _id: 1 } })
		) {
			existing += 1;
			continue;
		}

		const sections = text.split(/\n\s*\n/).map((block, index) => ({
			block: index,
			label: '',
			title: index === 0 ? song.title : '',
			lines: block.split('\n').map((line) => ({ role: 'line', text: line.trim() }))
		}));
		const lines = sections.flatMap((section, index) => [
			...(section.title
				? [
						{
							block: index,
							id: `s${index}-h`,
							kind: 'heading',
							order: 0,
							section_label: '',
							section_title: section.title,
							text: section.title
						}
					]
				: []),
			...section.lines.map((line, lineIndex) => ({
				block: index,
				id: `s${index}-l${lineIndex}`,
				kind: 'line',
				order: 0,
				role: 'line',
				section_label: '',
				section_title: section.title,
				text: line.text,
				verse_number: null
			}))
		]);
		lines.forEach((line, index) => {
			line.order = index;
		});
		if (!lines.some((line) => line.kind === 'line')) throw new Error(`No lines for ${videoId}`);
		if (!write) {
			created += 1;
			continue;
		}

		const now = new Date();
		const result = await db.collection('music_lyrics').updateOne(
			{ audio_id: audioId },
			{
				$setOnInsert: {
					audio_id: audioId,
					audio_object_id: song._id,
					audio_title: song.title,
					audio_artist: '',
					audio_book: '',
					audio_book_full_name: '',
					audio_category: song.category,
					audio_number: null,
					audio_version: '',
					audio_duration_seconds: song.duration ?? null,
					audio_s3_key: song.s3_key,
					audio_url: song.s3_url,
					lyrics_status: 'published',
					source_book: '',
					source_number: '',
					source_title: song.title,
					source_url: `https://www.youtube.com/watch?v=${videoId}`,
					title: song.title,
					sections,
					lines,
					lyrics_hash: createHash('sha256')
						.update(lines.map((line) => `${line.kind}:${line.text}`).join('\n'))
						.digest('hex'),
					timeline_draft: [],
					timeline_published: [],
					timeline_status: '',
					created_at: now,
					created_by: 'playlist-import',
					synced_at: now,
					synced_by: 'playlist-import',
					updated_at: now
				}
			},
			{ upsert: true }
		);
		if (!result.upsertedId) throw new Error(`Concurrent lyrics import for ${videoId}`);
		created += 1;
	}
	console.log(
		`${audio.length} playlist songs; ${Object.keys(transcripts).length} transcripts; ${existing} already attached; ${created} ${write ? 'attached' : 'ready to attach'}`
	);
} finally {
	await mongo.close();
}
