/** Run outside the web request path. Dry-run by default; --write persists
 * derived library_search fields and lookup indexes. No files/publication state change. */
import { MongoClient } from 'mongodb';
import { extract } from './library-extract.mjs';
import { ensureLibrarySearchIndexes } from '../src/lib/server/librarySearchIndexes.ts';

const args = new Set(process.argv.slice(2));
if (args.has('--help')) {
	console.log(
		'MONGODB_URI=… LIBRARY_ASSET_HOSTS=bucket.s3.region.amazonaws.com node --env-file=.env scripts/index-library.mjs [--write] [--force]'
	);
	process.exit(0);
}
if ([...args].some((arg) => !['--write', '--force'].includes(arg)))
	throw new Error('Unknown argument; use --help');
const allowedHosts = new Set(
	(process.env.LIBRARY_ASSET_HOSTS || '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
);
if (!process.env.MONGODB_URI || !allowedHosts.size)
	throw new Error('MONGODB_URI and explicit LIBRARY_ASSET_HOSTS are required');

const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
let failed = 0,
	indexed = 0,
	unchanged = 0;
try {
	await client.connect();
	const db = client.db('youtube_data');
	if (args.has('--write')) {
		await ensureLibrarySearchIndexes(db, console.log);
	}
	for (const collection of ['sermons', 'literature', 'pdfs', 'recordings']) {
		const filter =
			collection === 'recordings'
				? { published: true, status: 'ready', subtitles_hidden: { $ne: true } }
				: {
						published: { $ne: false },
						status: { $nin: ['draft', 'scheduled', 'archived', 'private'] }
					};
		const projection = {
			library_search: 1,
			pdf_url: 1,
			english_pdf_url: 1,
			parts: 1,
			url: 1,
			subtitle_srt_url: 1,
			subtitle_srt_s3_key: 1,
			subtitle_offset_into_recording_ms: 1,
			recordingId: 1
		};
		for await (const row of db.collection(collection).find(filter, { projection })) {
			if (collection === 'pdfs' && row.recordingId) {
				const { ObjectId } = await import('mongodb');
				if (
					!ObjectId.isValid(String(row.recordingId)) ||
					!(await db
						.collection('recordings')
						.findOne(
							{ _id: new ObjectId(String(row.recordingId)), published: true, status: 'ready' },
							{ projection: { _id: 1 } }
						))
				)
					continue;
			}
			let urls =
				collection === 'sermons'
					? [row.pdf_url, row.english_pdf_url]
					: collection === 'literature'
						? row.parts?.length
							? row.parts.map((part) => part.url)
							: /\.pdf(?:$|[?#])/i.test(row.pdf_url ?? '')
								? [row.pdf_url]
								: []
						: [row.url];
			if (collection === 'recordings') {
				const direct =
					row.subtitle_srt_s3_key && typeof row.subtitle_offset_into_recording_ms === 'number';
				const scheduled = direct
					? null
					: await db
							.collection('scheduled_lives')
							.findOne({ recording_id: String(row._id) }, { projection: { subtitle_srt_url: 1 } });
				urls = [direct ? row.subtitle_srt_url : scheduled?.subtitle_srt_url];
			}
			urls = [...new Set(urls.filter((url) => typeof url === 'string' && url))];
			if (!urls.length) continue;
			const assets = [];
			for (const url of urls) {
				const previous = row.library_search?.find((asset) => asset.url === url);
				if (previous && !args.has('--force')) {
					assets.push(previous);
					unchanged++;
					continue;
				}
				try {
					const asset = await extract(
						url,
						collection === 'recordings' ? 'srt' : 'pdf',
						allowedHosts
					);
					assets.push(asset);
					indexed++;
					console.log(
						`${collection}/${row._id}: ${asset.parts.length ? `${asset.parts.length} passages` : 'no text (scan/empty); metadata only'}`
					);
				} catch (error) {
					failed++;
					console.error(`${collection}/${row._id}: ${error.message}`);
					if (previous) assets.push(previous);
				}
			}
			if (args.has('--write'))
				await db
					.collection(collection)
					.updateOne({ _id: row._id }, { $set: { library_search: assets } });
		}
	}
} finally {
	await client.close();
}
console.log(
	`${args.has('--write') ? 'Indexed' : 'Dry run'}: ${indexed} extracted, ${unchanged} unchanged, ${failed} failed.`
);
if (failed) process.exitCode = 1;
