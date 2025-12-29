import { json } from '@sveltejs/kit';
import { getMusicArtists } from '../../../db/collections';
import type { RequestEvent } from './$types';

export async function GET({}: RequestEvent) {
	try {
		const artists = await getMusicArtists();
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
