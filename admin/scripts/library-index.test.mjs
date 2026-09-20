import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';

// Run against a LOCAL admin server using the same local youtube_data database.
test(
	'index dashboard and retry enforce permissions and validate job IDs',
	{
		skip: !process.env.LIBRARY_ADMIN_TEST_URL
	},
	async () => {
		const url = new URL(process.env.LIBRARY_ADMIN_TEST_URL);
		assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
		const uri = process.env.LIBRARY_TEST_MONGODB_URI;
		assert.match(uri, /^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//);
		const client = await new MongoClient(uri).connect();
		const db = client.db('youtube_data');
		const token = randomUUID(),
			denied = randomUUID();
		const email = `${token}@index-test.invalid`,
			deniedEmail = `${denied}@index-test.invalid`;
		const id = createHash('sha256').update(token).digest('hex');
		const call = async (cookie, method = 'GET', job = id) => {
			const response = await fetch(
				new URL(`/library-index${method === 'POST' ? '?/retry' : ''}`, url),
				{
					method,
					redirect: 'manual',
					headers: {
						Cookie: cookie ? `admin_session=${cookie}` : '',
						Origin: url.origin,
						Accept: 'application/json',
						...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
					},
					...(method === 'POST' ? { body: new URLSearchParams({ id: job }) } : {})
				}
			);
			return method === 'POST'
				? { status: (await response.json()).status ?? response.status }
				: response;
		};
		try {
			await db.collection('admin_users').insertMany([
				{ email, name: 'Index test', role: 'superadmin', is_active: true },
				{
					email: deniedEmail,
					name: 'Index test denied',
					role: 'editor',
					permissions: { can_manage_recordings: false },
					is_active: true
				}
			]);
			await db.collection('admin_sessions').insertMany([
				{ token, user_id: email, expires_at: new Date(Date.now() + 60_000) },
				{ token: denied, user_id: deniedEmail, expires_at: new Date(Date.now() + 60_000) }
			]);
			await db.collection('library_index_jobs').insertOne({
				_id: id,
				title: 'Test only',
				url: 'https://test.invalid/a.pdf',
				collection: 'pdfs',
				status: 'failed',
				attempts: 3,
				error: 'Test failure',
				updatedAt: new Date()
			});
			for (const method of ['GET', 'POST']) {
				assert.equal((await call('', method)).status, 303);
				assert.equal((await call(denied, method)).status, 403);
			}
			assert.equal((await call(token)).status, 200);
			assert.equal((await call(token, 'POST', '$invalid')).status, 400);
			assert.equal((await call(token, 'POST')).status, 200);
			assert.equal(
				(await db.collection('library_index_jobs').findOne({ _id: id })).status,
				'pending'
			);
			assert.equal((await call(token, 'POST')).status, 409);
		} finally {
			await db.collection('library_index_jobs').deleteOne({ _id: id });
			await db.collection('admin_users').deleteMany({ email: { $in: [email, deniedEmail] } });
			await db.collection('admin_sessions').deleteMany({ token: { $in: [token, denied] } });
			await db
				.collection('audit_logs')
				.deleteMany({ target_collection: 'library_index_jobs', target_id: id });
			await client.close();
		}
	}
);
