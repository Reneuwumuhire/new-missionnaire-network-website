import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MongoClient, ObjectId } from 'mongodb';
import { assetsFor, discover, processOne } from './library-index-queue.mjs';
import { extract } from './library-extract.mjs';

test('extractor refuses untrusted hosts, credentials, and non-HTTPS URLs before fetching', async () => {
	for (const url of [
		'http://assets.test/a.pdf',
		'https://other.test/a.pdf',
		'https://user:pass@assets.test/a.pdf'
	])
		await assert.rejects(extract(url, 'pdf', new Set(['assets.test'])), /not allowed/);
});

test('literature indexes PDFs, never the ZIP download container', () => {
	assert.equal(
		assetsFor('literature', { _id: 'book', pdf_url: 'https://assets.test/book.zip' }).length,
		0
	);
	assert.deepEqual(
		assetsFor('literature', {
			_id: 'book',
			pdf_url: 'https://assets.test/book.zip',
			parts: [{ title: 'Part 1', url: 'https://assets.test/part-1.pdf' }]
		}).map(({ url }) => url),
		['https://assets.test/part-1.pdf']
	);
	assert.equal(
		assetsFor('sermons', { _id: 'sermon', pdf_url: 'https://assets.test/sermon.pdf' })[0].revision,
		assetsFor('sermons', {
			_id: 'sermon',
			pdf_url: 'https://assets.test/sermon.pdf',
			parts: []
		})[0].revision
	);
});

test(
	'durable discovery, publication gates, replacement races, retries and leases',
	{ skip: !process.env.LIBRARY_TEST_MONGODB_URI },
	async () => {
		const uri = process.env.LIBRARY_TEST_MONGODB_URI;
		assert.match(uri, /^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//);
		const client = await new MongoClient(uri).connect();
		const db = client.db(`library_queue_test_${new ObjectId()}`);
		const jobs = db.collection('library_index_jobs');
		const pdfs = db.collection('pdfs');
		const now = new Date();
		const extracted = (url) => ({
			url,
			parts: [{ text: 'La foi nous suffit', page: 1 }],
			indexed_at: new Date()
		});
		const drain = async (extractor = async (url) => extracted(url)) => {
			let count = 0;
			while (await processOne(db, extractor)) {
				assert.ok(++count < 30);
			}
		};
		try {
			const recording = new ObjectId(),
				hidden = new ObjectId();
			await db.collection('recordings').insertMany([
				{ _id: recording, published: true, status: 'ready' },
				{
					_id: hidden,
					published: false,
					status: 'ready',
					subtitle_srt_url: 'https://assets.test/private.srt'
				}
			]);
			await db.collection('scheduled_lives').insertOne({
				recording_id: String(recording),
				subtitle_srt_url: 'https://assets.test/public.srt',
				updated_at: now
			});
			await pdfs.insertMany([
				{ url: 'https://assets.test/new.pdf', recordingId: recording, updatedAt: now },
				{ url: 'https://assets.test/private.pdf', recordingId: hidden },
				{ url: 'https://assets.test/draft.pdf', status: 'draft' },
				{
					url: 'https://assets.test/old.pdf',
					library_search: [extracted('https://assets.test/old.pdf')]
				},
				{
					url: 'https://assets.test/scan.pdf',
					library_search: [{ url: 'https://assets.test/scan.pdf', indexed_at: now, parts: [] }]
				}
			]);
			await db.collection('sermons').insertOne({
				pdf_url: 'https://assets.test/fr.pdf',
				english_pdf_url: 'https://assets.test/en.pdf'
			});
			assert.equal(await discover(db), 6);
			assert.equal(await jobs.countDocuments({ status: 'ready' }), 1);
			assert.equal(await jobs.countDocuments({ status: 'no_text' }), 1);
			assert.equal(await jobs.countDocuments({ status: 'pending' }), 4);
			await discover(db);
			assert.equal(await jobs.countDocuments(), 6);
			await drain();
			assert.equal(await jobs.countDocuments({ status: 'ready' }), 5);
			assert.equal((await db.collection('sermons').findOne()).library_search.length, 2);
			assert.equal(
				(await db.collection('recordings').findOne({ _id: recording })).library_search.length,
				1
			);
			await discover(db);
			assert.equal(
				await processOne(db, () => {
					throw new Error('should skip unchanged');
				}),
				false
			);

			// A same-URL replacement clears stale extracted text, queues once and saves the new version.
			const source = await pdfs.findOne({ url: 'https://assets.test/new.pdf' });
			await pdfs.updateOne(
				{ _id: source._id },
				{ $set: { updatedAt: new Date(now.getTime() + 1) } }
			);
			await discover(db);
			assert.equal((await pdfs.findOne({ _id: source._id })).library_search.length, 0);
			assert.equal(await jobs.countDocuments({ status: 'pending' }), 1);
			await processOne(db, async (url) => {
				await pdfs.updateOne(
					{ _id: source._id },
					{ $set: { url: 'https://assets.test/replaced.pdf' } }
				);
				return extracted(url);
			});
			assert.equal((await pdfs.findOne({ _id: source._id })).library_search.length, 0);
			await discover(db);
			await drain();
			assert.equal(
				(await pdfs.findOne({ _id: source._id })).library_search[0].url,
				'https://assets.test/replaced.pdf'
			);

			// Unpublishing while downloading cannot commit a stale/publication-changed job.
			await pdfs.insertOne({ url: 'https://assets.test/unpublish.pdf' });
			await discover(db);
			await processOne(db, async (url) => {
				await pdfs.updateOne({ url }, { $set: { published: false } });
				return extracted(url);
			});
			assert.equal(
				(await pdfs.findOne({ url: 'https://assets.test/unpublish.pdf' })).library_search,
				undefined
			);

			await pdfs.insertOne({ url: 'https://assets.test/failure.pdf' });
			await discover(db);
			for (let i = 0; i < 3; i++) {
				await jobs.updateMany({ status: 'pending' }, { $set: { availableAt: new Date(0) } });
				await processOne(db, async () => {
					throw new Error('Asset request failed (503)');
				});
			}
			const failed = await jobs.findOne({ status: 'failed' });
			assert.equal(failed.attempts, 3);
			await discover(db);
			assert.equal(await jobs.countDocuments({ status: 'failed' }), 1);
			// Admin retry contract; two claimants must not extract the same job.
			await jobs.updateOne(
				{ _id: failed._id },
				{ $set: { status: 'pending', attempts: 0, availableAt: new Date(0) } }
			);
			let calls = 0;
			await Promise.all(
				[1, 2].map(() =>
					processOne(db, async (url) => {
						calls++;
						return extracted(url);
					})
				)
			);
			assert.equal(calls, 1);
			await jobs.updateOne(
				{ _id: failed._id },
				{ $set: { status: 'processing', availableAt: new Date(0), attempts: 1 } }
			);
			await processOne(db, async (url) => ({ ...extracted(url), parts: [] }));
			assert.equal((await jobs.findOne({ _id: failed._id })).status, 'no_text');
		} finally {
			await db.dropDatabase();
			await client.close();
		}
	}
);
