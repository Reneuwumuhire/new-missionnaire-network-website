import { json } from '@sveltejs/kit';
import { getMusicArtists } from '../../../db/collections';
import type { RequestEvent } from './$types';

export async function GET({ setHeaders }: RequestEvent) {
	try {
		const artists = await getMusicArtists();
		// Edge-cache aggressively: the distinct artist list rarely changes
		// (new tracks are uploaded in batches, never with new artists more
		// than once a week). 5-minute fresh window keeps the music page
		// snappy on reload, and a 1-day stale-while-revalidate ceiling
		// means a cold lambda only needs to recompute once a day per
		// edge node — meanwhile listeners always see the cached array
		// instantly, even when MongoDB is cold.
		setHeaders({
			'cache-control': 'public, s-maxage=300, stale-while-revalidate=86400'
		});
		return json({
			data: artists,
			error: null
		});
	} catch (error) {
		console.error('[API] Error in GET /api/music-artists:', error);
		return json(
			{
				data: [],
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
}
