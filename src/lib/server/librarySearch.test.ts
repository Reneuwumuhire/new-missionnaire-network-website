import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { MongoClient, ObjectId, type Db } from 'mongodb';
vi.mock('../../db/mongo', () => ({ getDb: vi.fn() }));
import {
	searchLibrary,
	toLibraryResult,
	librarySourcePipeline,
	libraryTextTerm
} from './librarySearch';
import { parseLibraryFilters } from '../utils/librarySearch';
import { ensureLibrarySearchIndexes } from './librarySearchIndexes';

it('uses an indexed first stage for file text, not raw user search syntax', () => {
	const filters = parseLibraryFilters(new URLSearchParams('q=amour'));
	expect(librarySourcePipeline('sermons', filters, true)[0]).toEqual({
		$match: { $text: { $search: 'amour', $language: 'none' } }
	});
	expect(JSON.stringify(librarySourcePipeline('sermons', filters))).not.toContain(
		'$library_search'
	);
	expect(libraryTextTerm('-amour "foi"')).toBe('amour');
	expect(libraryTextTerm('.*')).toBe('');
	expect(libraryTextTerm('gra\u0302ce')).toBe('grâce');
});

it('maps timed snippets and safe document links', () => {
	const row = {
		id: 'test',
		type: 'recordings',
		title: 'Sermon',
		author: '',
		category: '',
		languages: ['rw'],
		date: new Date('2026-01-01'),
		part: { text: 'la grâce', startMs: 4000 },
		offsetMs: 10000
	};
	const result = toLibraryResult(row, 'grace');
	expect(result.startSec).toBe(14);
	expect(result.snippet.match).toBe('grâce');
	expect(result.href).toBe('/live/rediffusions/test');
	expect(toLibraryResult({ ...row, canSeekPart: false }, 'grace').startSec).toBeNull();
	expect(
		toLibraryResult({ ...row, type: 'documents', url: 'javascript:alert(1)' }, 'grace').href
	).toBe('');
});

// Optional real-Mongo integration suite. Never touches the application's database.
const uri = process.env.LIBRARY_TEST_MONGODB_URI;
describe.skipIf(!uri)('library search Mongo integration', () => {
	let client: MongoClient, db: Db;
	const songId = new ObjectId(),
		recId = new ObjectId(),
		privateId = new ObjectId(),
		fallbackId = new ObjectId();
	const run = (query = 'q=grace') =>
		searchLibrary(parseLibraryFilters(new URLSearchParams(query)), db);
	beforeAll(async () => {
		if (!uri || !/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri))
			throw new Error('Integration tests require explicit local Mongo URI');
		client = await new MongoClient(uri).connect();
		db = client.db(`library_search_test_${new ObjectId()}`);
		await ensureLibrarySearchIndexes(db);
		await db.collection('sermons').insertOne({
			french_title: 'La grâce',
			author: 'Prédicateur',
			full_date_code: '65-0101',
			date_code: '65-0101',
			iso_date: '1965-01-01',
			mp3_url: 'https://assets.test/sermon.mp3',
			pdf_url: 'https://assets.test/sermon.pdf'
		});
		await db.collection('music_audio').insertMany([
			{
				_id: songId,
				title: 'Un cantique',
				artist: 'Samonte',
				category: 'Chorus',
				language: 'french',
				uploaded_at: new Date('2026-01-01'),
				s3_url: 'https://assets.test/song.mp3'
			},
			{ title: 'Private grace', published: false, s3_url: 'https://assets.test/private.mp3' }
		]);
		await db.collection('music_lyrics').insertMany([
			{
				audio_id: songId.toString(),
				lyrics_status: 'published',
				lines: [{ id: 'verse', text: 'La grâce nous suffit' }],
				timeline_published: [{ line_id: 'verse', start_ms: 12500 }]
			},
			{ audio_id: songId.toString(), lyrics_status: 'draft', lines: [{ text: 'secret-lyrics' }] }
		]);
		await db.collection('recordings').insertMany([
			{
				_id: recId,
				title: 'Une réunion',
				published: true,
				status: 'ready',
				started_at: new Date('2026-01-02'),
				french_audio_s3_url: 'https://assets.test/french.mp3',
				subtitle_srt_url: 'https://assets.test/live.srt',
				subtitle_srt_s3_key: 'subtitles/live.srt',
				subtitle_offset_into_recording_ms: 5000,
				library_search: [
					{
						url: 'https://assets.test/live.srt',
						parts: [{ text: 'La grâce dans la réunion', startMs: 10000 }]
					}
				]
			},
			{ _id: privateId, title: 'Private grace', published: false, status: 'ready' },
			{ title: 'Not ready grace', published: true, status: 'processing' },
			{
				_id: fallbackId,
				title: 'Fallback',
				published: true,
				status: 'ready',
				started_at: new Date('2026-01-02'),
				library_search: [
					{
						url: 'https://assets.test/scheduled.srt',
						parts: [{ text: 'grâce retransmise', startMs: 2000 }]
					}
				]
			}
		]);
		await db.collection('scheduled_lives').insertOne({
			recording_id: fallbackId.toString(),
			subtitle_srt_url: 'https://assets.test/scheduled.srt',
			subtitle_anchor_epoch_ms: Date.parse('2026-01-02') + 3000,
			subtitle_offset_ms: 1000
		});
		await db.collection('pdfs').insertMany([
			{
				filename: 'Transcription',
				url: 'https://assets.test/transcript.pdf',
				publishedOn: new Date('2026-01-02'),
				library_search: [
					{
						url: 'https://assets.test/transcript.pdf',
						parts: [{ text: 'La grâce transcrite', page: 3 }]
					}
				]
			},
			{
				filename: 'Private transcript grace',
				recordingId: privateId,
				url: 'https://assets.test/private.pdf'
			},
			{
				filename: 'Replaced',
				url: 'https://assets.test/new.pdf',
				library_search: [{ url: 'https://assets.test/old.pdf', parts: [{ text: 'stale-only' }] }]
			}
		]);
		await db.collection('literature').insertOne({
			title: 'Une brochure de grâce',
			language: 'french',
			type: 'Books',
			pdf_url: 'https://assets.test/book.pdf',
			library_search: [
				{ url: 'https://assets.test/book.pdf', parts: [{ text: 'La grâce écrite', page: 2 }] }
			]
		});
	}, 20000);
	afterAll(async () => {
		if (db) await db.dropDatabase();
		await client?.close();
	});
	it('finds all five types, published lyric/SRT text and PDF page matches', async () => {
		const result = await run();
		expect(result.total).toBe(6);
		expect(new Set(result.results.map((r) => r.type)).size).toBe(5);
		expect(result.results[0].type).toBe('sermons');
		expect(result.results.find((r) => r.type === 'songs')?.startSec).toBe(12.5);
		expect(result.results.find((r) => r.id === recId.toString())?.startSec).toBe(15);
		expect(result.results.find((r) => r.id === fallbackId.toString())?.startSec).toBe(6);
		expect(result.results.find((r) => r.type === 'transcriptions')?.pageHref).toContain('#page=3');
		expect(result.results.find((r) => r.type === 'transcriptions')?.href).toContain(
			'/lecture/transcriptions/'
		);
	});
	it('combines filters and includes the whole end date', async () => {
		const result = await run(
			'q=grace&type=songs&author=samonte&category=Chorus&language=fr&from=2026-01-01&to=2026-01-01'
		);
		expect(result.total).toBe(1);
		expect((await run('q=grace&type=songs&language=en')).total).toBe(0);
		const dubbed = (await run('q=grace&type=recordings&language=fr')).results[0];
		expect(dubbed.audioUrl).toBe('https://assets.test/french.mp3');
		expect(dubbed.startSec).toBeNull();
	});
	it('never exposes private, draft or stale extracted content', async () => {
		for (const q of ['Private', 'secret-lyrics', 'stale-only', 'Not ready'])
			expect((await run(`q=${encodeURIComponent(q)}`)).total).toBe(0);
	});
	it('uses the text index rather than examining unrelated PDF bodies', async () => {
		const plan = await db
			.collection('literature')
			.find({
				$text: { $search: 'grace', $language: 'none' }
			})
			.explain('executionStats');
		expect(JSON.stringify(plan.queryPlanner.winningPlan)).toContain('library_file_text_v1');
		expect(plan.executionStats.totalDocsExamined).toBe(1);
		expect((await run('q=grace&type=documents')).total).toBe(1);
	});
	it('keeps phrase, accent and literal punctuation matching without duplicate source rows', async () => {
		await db.collection('literature').insertOne({
			title: 'Nouveau document',
			language: 'rw',
			pdf_url: 'https://assets.test/new.pdf',
			library_search: [
				{
					url: 'https://assets.test/new.pdf',
					parts: [{ page: 2, text: 'La gra\u0302ce nous suffit. [test] et C++.' }]
				}
			]
		});
		for (const query of ['grâce nous suffit', '[test]', 'C++']) {
			const result = await run(`q=${encodeURIComponent(query)}&type=documents`);
			expect(result.total).toBe(1);
			expect(result.results[0].page).toBe(2);
		}
		expect((await run('q=Nouv&type=documents')).total).toBe(1);
		expect((await run('q=grace&type=documents')).total).toBe(2);
		await db.collection('literature').deleteOne({ title: 'Nouveau document' });
	});
	it('invalidates indexed text immediately after unpublishing or replacing its attachment', async () => {
		const col = db.collection('literature');
		await col.updateOne({ title: 'Une brochure de grâce' }, { $set: { published: false } });
		expect((await run('q=écrite&type=documents')).total).toBe(0);
		await col.updateOne(
			{ title: 'Une brochure de grâce' },
			{ $set: { published: true, pdf_url: 'https://assets.test/replaced.pdf' } }
		);
		expect((await run('q=écrite&type=documents')).total).toBe(0);
		await col.updateOne(
			{ title: 'Une brochure de grâce' },
			{ $set: { pdf_url: 'https://assets.test/book.pdf' } }
		);
	});
	it('hides subtitle text as soon as the recording hides it', async () => {
		await db
			.collection('recordings')
			.updateOne({ _id: recId }, { $set: { subtitles_hidden: true } });
		expect((await run('q=grace&type=recordings')).results.map((r) => r.id)).not.toContain(
			recId.toString()
		);
		await db
			.collection('recordings')
			.updateOne({ _id: recId }, { $set: { subtitles_hidden: false } });
	});
	it('validates language-specific attachments after the index lookup', async () => {
		const col = db.collection('sermons');
		const { insertedId } = await col.insertOne({
			french_title: 'Langues',
			english_title: 'Languages',
			pdf_url: 'https://assets.test/fr.pdf',
			english_pdf_url: 'https://assets.test/en.pdf',
			library_search: [
				{ url: 'https://assets.test/fr.pdf', parts: [{ text: 'francophone', page: 7 }] },
				{ url: 'https://assets.test/en.pdf', parts: [{ text: 'anglophone', page: 9 }] }
			]
		});
		expect((await run('q=anglophone&type=sermons&language=fr')).total).toBe(0);
		const english = await run('q=anglophone&type=sermons&language=en');
		expect(english.results[0].pageHref).toBe('https://assets.test/en.pdf#page=9');
		await col.deleteOne({ _id: insertedId });
	});
	it('paginates deterministically without duplicate or missing items', async () => {
		await db.collection('literature').insertMany(
			Array.from({ length: 25 }, (_, i) => ({
				title: `Pagination ${i}`,
				pdf_url: 'https://assets.test/book.pdf'
			}))
		);
		const first = await run('q=Pagination'),
			second = await run('q=Pagination&page=2');
		expect(first.total).toBe(25);
		expect(first.results.length).toBe(20);
		expect(second.results.length).toBe(5);
		expect(new Set([...first.results, ...second.results].map((r) => r.id)).size).toBe(25);
	});
});
