import { MongoClient } from 'mongodb';
import {
	ensureLibrarySearchIndexes,
	libraryFileCollections,
	libraryTextIndex
} from '../src/lib/server/librarySearchIndexes.ts';

if (process.argv.slice(2).some((arg) => !['--write', '--help'].includes(arg)))
	throw new Error('Unknown argument');
if (process.argv.includes('--help')) {
	console.log(
		'node --env-file=.env.local scripts/create-library-search-indexes.mjs [--write]\nCreates database text indexes on existing extracted text. No downloads or content changes.'
	);
	process.exit(0);
}
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
try {
	await client.connect();
	const db = client.db('youtube_data');
	if (process.argv.includes('--write')) {
		await ensureLibrarySearchIndexes(db, console.log);
		console.log('All library search indexes are ready. No files or content were changed.');
	} else {
		for (const name of libraryFileCollections) {
			const indexes = await db.collection(name).listIndexes().toArray();
			console.log(
				`${name}: ${indexes.some((i) => i.name === libraryTextIndex.name) ? 'index exists' : 'text index needed'}`
			);
		}
		console.log('Dry run only. Add --write to create indexes; this does not re-extract files.');
	}
} finally {
	await client.close();
}
