import { json } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import { queryMusicAudio } from '../../../db/collections';
import { getDb } from '../../../db/mongo';
import type { RequestEvent } from './$types';

type LyricsAudioIdRow = { audio_id?: string | ObjectId };

/** Query music_lyrics once for the page's audio IDs and return the set of
 *  IDs that have a published lyrics doc. Powers the small "has lyrics"
 *  indicator next to titles in the music list. One DB round-trip per page. */
async function lyricsAvailableIds(audioIds: string[]): Promise<Set<string>> {
	if (audioIds.length === 0) return new Set();
	const objectIds = audioIds
		.filter((id) => ObjectId.isValid(id))
		.map((id) => new ObjectId(id));
	const db = await getDb();
	const rows = await db
		.collection<LyricsAudioIdRow>('music_lyrics')
		.find(
			{
				audio_id: { $in: [...audioIds, ...objectIds] },
				lyrics_status: 'published'
			},
			{ projection: { _id: 0, audio_id: 1 } }
		)
		.toArray();
	const result = new Set<string>();
	for (const row of rows) {
		const id = row.audio_id;
		if (id instanceof ObjectId) result.add(id.toString());
		else if (typeof id === 'string') result.add(id);
	}
	return result;
}

export async function GET({ url, setHeaders }: RequestEvent) {
	try {
		const category = url.searchParams.get('category') ?? undefined;
		const search = url.searchParams.get('search') ?? undefined;
		const alpha = url.searchParams.get('alpha') ?? undefined;
		const numberStr = url.searchParams.get('number');
		const number = numberStr ? Number.parseInt(numberStr) : undefined;
		const limit = Number.parseInt(url.searchParams.get('limit') || '20');
		const pageNumber = Number.parseInt(url.searchParams.get('pageNumber') || '1');
		const sort = url.searchParams.get('sort') || 'uploaded_at:desc';
		const artist = url.searchParams.get('artist') ?? undefined;
		const seed = url.searchParams.get('seed') ?? undefined;

		// Edge-cache list responses. Search results are skipped — the
		// query space is unbounded and individual queries are unlikely
		// to repeat at the edge often enough to be worth it. Random
		// sort is included because the seed makes the URL stable per
		// session (so reload + back-button benefit), and the in-memory
		// shuffle cache helps the origin too. Browsing/filtering hits
		// the same URLs across users, so this is where edge caching
		// pays off the most.
		if (!search) {
			setHeaders({
				'cache-control': 'public, s-maxage=30, stale-while-revalidate=300'
			});
		}

		const result = await queryMusicAudio({
			category,
			search,
			alpha,
			artist,
			number,
			limit,
			pageNumber,
			orderBy: sort,
			seed
		});

		const ids = result.data
			.map((row) => (typeof row._id === 'string' ? row._id : ''))
			.filter(Boolean);
		const lyricsSet = await lyricsAvailableIds(ids);
		const enriched = result.data.map((row) => ({
			...row,
			has_lyrics: typeof row._id === 'string' ? lyricsSet.has(row._id) : false
		}));

		return json({
			data: enriched,
			total: result.total,
			error: null
		});
	} catch (error) {
		console.error('API Error:', error);
		return json(
			{
				data: [],
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
}
