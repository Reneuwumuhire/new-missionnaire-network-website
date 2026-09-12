import type { Db } from 'mongodb';

export const libraryFileCollections = ['sermons', 'literature', 'pdfs', 'recordings'] as const;
export const libraryTextIndex = {
	name: 'library_file_text_v1',
	default_language: 'none',
	// Source records have legacy language values such as "rw". Do not interpret
	// those as MongoDB stemmer names, and keep stop words in every language.
	language_override: '_library_text_language',
	textIndexVersion: 3
};

export async function ensureLibrarySearchIndexes(db: Db, report = (_message: string) => {}) {
	for (const name of libraryFileCollections) {
		report(`Building/checking ${name}/${libraryTextIndex.name}…`);
		await db
			.collection(name)
			.createIndex({ 'library_search.parts.text': 'text' }, libraryTextIndex);
		report(`${name}: ready`);
	}
	await db.collection('music_lyrics').createIndex({ audio_id: 1, lyrics_status: 1 });
	await db.collection('scheduled_lives').createIndex({ recording_id: 1 });
}
