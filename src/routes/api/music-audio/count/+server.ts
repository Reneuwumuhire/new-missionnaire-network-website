import { json } from '@sveltejs/kit';
import { getDb } from '../../../../db/mongo';

// Tiny module-level cache. The total catalogue size barely changes between
// uploads, so a 5-minute TTL is more than enough to absorb burst traffic
// without forcing every page-load to round-trip to MongoDB. The hero copy
// only needs an approximate "how many songs do we have?" — a stale-by-5-min
// number is indistinguishable from a fresh one to a listener.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { count: number; ts: number } | null = null;

export async function GET() {
	const now = Date.now();
	if (cached && now - cached.ts < CACHE_TTL_MS) {
		return json(
			{ count: cached.count },
			{ headers: { 'Cache-Control': 'public, max-age=300' } }
		);
	}

	try {
		const db = await getDb();
		// `estimatedDocumentCount` reads collection metadata — O(1) and
		// effectively free, vs. `countDocuments({})` which scans an index.
		// For a ~1.5k-song collection it doesn't matter much, but this
		// endpoint is hit on every music-page mount so the cheaper call
		// keeps load on the database flat regardless of traffic spikes.
		const count = await db.collection('music_audio').estimatedDocumentCount();
		cached = { count, ts: now };
		return json(
			{ count },
			{ headers: { 'Cache-Control': 'public, max-age=300' } }
		);
	} catch (error) {
		console.error('[API] music-audio count error:', error);
		// Don't 500 the route: the hero falls back to its default copy when
		// `count` is missing, so failing gracefully here keeps the page
		// useful even if the database is briefly unreachable.
		return json({ count: null }, { status: 200 });
	}
}
