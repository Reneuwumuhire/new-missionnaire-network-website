import { json } from '@sveltejs/kit';
import { getMusicArtists } from '../../../db/collections';
import { canManageMusicAudio } from '$lib/models/admin-user';
import type { RequestEvent } from './$types';

export async function GET({ locals }: RequestEvent) {
	if (!canManageMusicAudio(locals.user)) {
		return json({ data: [], error: 'Accès refusé' }, { status: 403 });
	}

	try {
		const artists = await getMusicArtists();
		return json({ data: artists, error: null });
	} catch (error) {
		console.error('Artists API Error:', error);
		return json({ data: [], error: 'Failed to fetch artists' }, { status: 500 });
	}
}
