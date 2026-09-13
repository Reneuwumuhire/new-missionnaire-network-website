import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MongoClient, ObjectId, type Db } from 'mongodb';
vi.mock('../../db/mongo', () => ({ getDb: vi.fn() }));
import { getDb } from '../../db/mongo';
import { readLibraryPassage, loadLibrarySource } from './libraryPassage';
import { searchLibrary } from './librarySearch';
import { ensureLibrarySearchIndexes } from './librarySearchIndexes';
import { parseLibraryFilters } from '../utils/librarySearch';
import { passageOccurrences, passageRanges } from '../utils/passageSearch';
import { GET } from '../../routes/api/library/[type]/[id]/pdf/+server';

it('finds long, repeated and accent-tolerant quotations across lines with original offsets', () => {
	const parts = [
		{ text: 'Avant. La GRÂCE', page: 2 },
		{ text: 'nous suffit. La grâce nous suffit.', page: 3 }
	];
	const result = passageOccurrences(parts, 'la grace nous suffit');
	expect(result.matches).toHaveLength(2);
	expect(result.text.slice(result.matches[0].start, result.matches[0].end)).toBe(
		'La GRÂCE\nnous suffit'
	);
	expect(passageRanges('la foi demeure', 'foi la')).toHaveLength(0);
	expect(passageOccurrences([{ text: 'la foi demeure' }], 'foi la', 'words').matches).toHaveLength(
		1
	);
	expect(
		passageOccurrences([{ text: 'la foi demeure' }], 'foi amour', 'words').matches
	).toHaveLength(0);
	const long = 'La grâce nous accompagne toujours. '.repeat(8).trim();
	expect(parseLibraryFilters(new URLSearchParams({ q: long })).q).toBe(long);
	expect(passageRanges(long, long)).toHaveLength(1);
	for (const literal of ['C++', '[test]', '.*'])
		expect(passageRanges(literal, literal)).toHaveLength(1);
});

const uri = process.env.LIBRARY_TEST_MONGODB_URI;
describe.skipIf(!uri)('published passage reader with local Mongo', () => {
	let client: MongoClient, db: Db;
	const document = new ObjectId(),
		song = new ObjectId(),
		recording = new ObjectId(),
		sermon = new ObjectId();
	const asset = 'https://missionnaire-bucket.s3.af-south-1.amazonaws.com/test.pdf';
	const query = 'la grâce nous suffit';
	const search = (q = query, type = '', match = 'phrase') =>
		searchLibrary(parseLibraryFilters(new URLSearchParams({ q, type, match })), db);
	const read = (type = 'documents', id = document, changes: Record<string, string> = {}) =>
		readLibraryPassage(type, id.toString(), new URLSearchParams({ q: query, ...changes }), db);
	beforeAll(async () => {
		if (!uri || !/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri))
			throw new Error('Only isolated local Mongo is allowed');
		client = await new MongoClient(uri).connect();
		db = client.db(`library_passage_test_${new ObjectId()}`);
		vi.mocked(getDb).mockResolvedValue(db);
		await ensureLibrarySearchIndexes(db);
		await db.collection('literature').insertOne({
			_id: document,
			title: 'Une brochure',
			pdf_url: asset,
			library_search: [
				{
					url: asset,
					parts: [
						{ page: 2, text: 'Avant. La grâce' },
						{ page: 3, text: 'nous suffit. La grâce nous suffit.' }
					]
				}
			]
		});
		await db
			.collection('music_audio')
			.insertOne({ _id: song, title: 'Un chant', s3_url: 'https://assets.test/song.mp3' });
		await db.collection('music_lyrics').insertOne({
			audio_id: song.toString(),
			lyrics_status: 'published',
			lines: [
				{ id: 'a', text: 'La grâce' },
				{ id: 'b', text: 'nous suffit' }
			],
			timeline_published: [{ line_id: 'a', start_ms: 12000 }]
		});
		await db.collection('recordings').insertOne({
			_id: recording,
			title: 'Un message',
			published: true,
			status: 'ready',
			subtitle_srt_url: 'https://assets.test/audio.srt',
			subtitle_srt_s3_key: 'audio.srt',
			subtitle_offset_into_recording_ms: 5000,
			library_search: [
				{
					url: 'https://assets.test/audio.srt',
					parts: [
						{ startMs: 10000, text: 'La grâce' },
						{ startMs: 14000, text: 'nous suffit' }
					]
				}
			]
		});
		await db.collection('sermons').insertOne({
			_id: sermon,
			french_title: 'Français',
			english_title: 'English',
			pdf_url: asset,
			english_pdf_url: 'https://assets.test/en.pdf',
			library_search: [
				{ url: asset, parts: [{ page: 1, text: 'La grâce' }] },
				{ url: 'https://assets.test/en.pdf', parts: [{ page: 1, text: 'nous suffit' }] }
			]
		});
	});
	afterAll(async () => {
		if (db) await db.dropDatabase();
		await client?.close();
	});
	it('matches across PDF pages, lyric lines and SRT cues without crossing attachments', async () => {
		const found = await search();
		expect(found.total).toBe(3);
		expect(found.results.find((r) => r.type === 'songs')?.startSec).toBe(12);
		expect(found.results.find((r) => r.type === 'recordings')?.startSec).toBe(15);
		const first = await read();
		expect(first.count).toBe(2);
		expect(first.pages.map((p) => p.page)).toEqual([2, 3]);
		expect(
			first.segments
				.filter((s) => s.marked)
				.map((s) => s.text)
				.join('')
		).toBe('La grâce\nnous suffit');
		const next = await read('documents', document, { occurrence: '2' });
		expect(next.pages.map((p) => p.page)).toEqual([3]);
		expect(next.segments.map((segment) => segment.text).join('')).not.toContain('Avant.');
		expect((await read('songs', song)).result.startSec).toBe(12);
		expect((await read('recordings', recording)).result.startSec).toBe(15);
		for (const occurrence of ['0', '3', '1.5', 'NaN'])
			await expect(read('documents', document, { occurrence })).rejects.toMatchObject({
				status: 404
			});
	});
	it('keeps similar passages explicit and requires all words', async () => {
		expect((await search('suffit grâce la', 'documents')).total).toBe(0);
		expect((await search('suffit grâce la', 'documents', 'words')).total).toBe(1);
		expect((await search('suffit grâce absente', 'documents', 'words')).total).toBe(0);
		const similar = await read('documents', document, { q: 'suffit grâce la', match: 'words' });
		expect(similar.mode).toBe('words');
		expect(
			similar.segments.filter((s) => s.marked).every((s) => /^(suffit|grâce|la)$/i.test(s.text))
		).toBe(true);
	});
	it('rejects guessed assets, hidden lyrics/subtitles and unpublished owners', async () => {
		await expect(
			read('documents', document, { asset: 'https://evil.test/secret.pdf' })
		).rejects.toMatchObject({ status: 404 });
		await db
			.collection('music_lyrics')
			.updateOne({ audio_id: song.toString() }, { $set: { lyrics_status: 'draft' } });
		await expect(read('songs', song)).rejects.toMatchObject({ status: 404 });
		await db
			.collection('recordings')
			.updateOne({ _id: recording }, { $set: { subtitles_hidden: true } });
		await expect(read('recordings', recording)).rejects.toMatchObject({ status: 404 });
		const { insertedId } = await db.collection('pdfs').insertOne({
			filename: 'Owned',
			recordingId: recording,
			url: asset,
			library_search: [{ url: asset, parts: [{ page: 1, text: query }] }]
		});
		await db.collection('recordings').updateOne({ _id: recording }, { $set: { published: false } });
		await expect(read('transcriptions', insertedId)).rejects.toMatchObject({ status: 404 });
	});
	it('streams byte ranges only for the validated published PDF', async () => {
		const fetch = vi.fn().mockResolvedValue(
			new Response('pdf', {
				status: 206,
				headers: { 'content-range': 'bytes 0-2/20', 'content-length': '3' }
			})
		);
		const event = {
			params: { type: 'documents', id: document.toString() },
			url: new URL(`https://site.test/api/library/documents/${document}/pdf?q=grace`),
			request: new Request('https://site.test', { headers: { range: 'bytes=0-2' } }),
			fetch
		};
		const response = await GET(event as unknown as Parameters<typeof GET>[0]);
		expect(response.status).toBe(206);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.text()).toBe('pdf');
		expect(fetch.mock.calls[0][1].headers.Range).toBe('bytes=0-2');
		await db.collection('literature').updateOne({ _id: document }, { $set: { published: false } });
		await expect(GET(event as unknown as Parameters<typeof GET>[0])).rejects.toMatchObject({
			status: 404
		});
		expect(fetch).toHaveBeenCalledTimes(1);
		await db
			.collection('literature')
			.updateOne(
				{ _id: document },
				{ $set: { published: true, pdf_url: 'https://assets.test/replaced.pdf' } }
			);
		await expect(read()).rejects.toMatchObject({ status: 404 });
		await expect(
			loadLibrarySource('unknown', document.toString(), new URLSearchParams(), db)
		).rejects.toMatchObject({ status: 404 });
	});
});
