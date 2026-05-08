import { error } from '@sveltejs/kit';
import { queryMusicAudio, getMusicArtists, getMusicCategories } from '../../db/collections';
import { canManageMusicAudio } from '$lib/models/admin-user';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!canManageMusicAudio(locals.user)) throw error(403, 'Accès refusé');

	const category = url.searchParams.get('category') ?? undefined;
	const search = url.searchParams.get('search') ?? undefined;
	const artist = url.searchParams.get('artist') ?? undefined;
	const lyricsParam = url.searchParams.get('lyrics');
	const lyrics =
		lyricsParam === 'with' || lyricsParam === 'without' ? lyricsParam : undefined;
	const limit = Number.parseInt(url.searchParams.get('limit') || '25');
	const pageNumber = Number.parseInt(url.searchParams.get('pageNumber') || '1');
	const sort = url.searchParams.get('sort') || 'uploaded_at:desc';

	const [result, artists, categories] = await Promise.all([
		queryMusicAudio({ category, search, artist, lyrics, limit, pageNumber, orderBy: sort }),
		getMusicArtists(),
		getMusicCategories()
	]);

	return {
		audioList: result.data,
		total: result.total,
		artists,
		categories,
		filters: { category, search, artist, lyrics, sort },
		pagination: { limit, pageNumber }
	};
};
