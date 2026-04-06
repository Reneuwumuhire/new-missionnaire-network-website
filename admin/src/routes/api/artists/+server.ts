import { json } from '@sveltejs/kit';
import { getMusicArtists } from '../../../db/collections';
import type { RequestEvent } from './$types';

export async function GET(_event: RequestEvent) {
	try {
		const artists = await getMusicArtists();
		return json({ data: artists, error: null });
	} catch (error) {
		console.error('Artists API Error:', error);
		return json({ data: [], error: 'Failed to fetch artists' }, { status: 500 });
	}
}
