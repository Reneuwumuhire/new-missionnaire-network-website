import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MongoClient, ServerApiVersion, type Db } from 'mongodb';
vi.mock('../../db/mongo', () => ({ getDb: vi.fn() }));
import { searchLibrary } from './librarySearch';
import { parseLibraryFilters } from '../utils/librarySearch';
import { getDb } from '../../db/mongo';
import { GET } from '../../routes/api/search/+server';

// Explicit opt-in, read-only against the configured catalogue. Never creates
// indexes, writes fixtures or drops a database. Ordinary tests use local Mongo.
describe.skipIf(process.env.LIBRARY_BENCHMARK !== '1')('real catalogue search budget', () => {
	let client: MongoClient, db: Db;
	beforeAll(async () => {
		if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
		client = await new MongoClient(process.env.MONGODB_URI, {
			serverSelectionTimeoutMS: 10000,
			serverApi: { version: ServerApiVersion.v1, strict: false, deprecationErrors: true }
		}).connect();
		db = client.db('youtube_data');
		vi.mocked(getDb).mockResolvedValue(db);
	});
	afterAll(async () => {
		await client?.close();
	});
	it.each([
		'q=amour',
		'q=amour&type=sermons&language=fr',
		'q=grace',
		'q=foi',
		'q=am',
		'q=zznonexistent987654321',
		'q=la+foi',
		'q=foi+foi+foi+foi+foi',
		'q=amour+foi&match=words',
		'q=quand+je+monte+a+la+chaire',
		`q=${encodeURIComponent('Et d’une façon ou d’une autre, quand je monte à la chaire, je sens que leurs prières seront exaucées. Et je sais qu’Il est ici.')}`
	])(
		'%s finishes within budget',
		async (query) => {
			const start = performance.now();
			const result = await searchLibrary(parseLibraryFilters(new URLSearchParams(query)), db);
			const elapsed = Math.round(performance.now() - start);
			console.log(
				JSON.stringify({
					query,
					elapsedMs: elapsed,
					total: result.total,
					returned: result.results.length
				})
			);
			expect(elapsed).toBeLessThan(5000);
			expect(result.results.length).toBeLessThanOrEqual(20);
		},
		15000
	);
	it('returns a successful non-cached search API response', async () => {
		const response = await GET({
			url: new URL('https://example.test/api/search?q=amour')
		} as Parameters<typeof GET>[0]);
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store');
		const body = await response.json();
		expect(body.results).toHaveLength(20);
		expect(body.total).toBeGreaterThan(0);
	}, 15000);
});
