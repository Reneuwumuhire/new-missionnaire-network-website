import { json } from '@sveltejs/kit';
import { queryMusicAudio } from '../../../db/collections';
import { canManageMusicAudio } from '$lib/models/admin-user';
import type { RequestEvent } from './$types';

export async function GET({ locals, url }: RequestEvent) {
	if (!canManageMusicAudio(locals.user)) {
		return json({ data: [], total: 0, error: 'Accès refusé' }, { status: 403 });
	}

	try {
		const category = url.searchParams.get('category') ?? undefined;
		const search = url.searchParams.get('search') ?? undefined;
		const artist = url.searchParams.get('artist') ?? undefined;
		const limit = Number.parseInt(url.searchParams.get('limit') || '20');
		const pageNumber = Number.parseInt(url.searchParams.get('pageNumber') || '1');
		const sort = url.searchParams.get('sort') || 'uploaded_at:desc';

		const result = await queryMusicAudio({
			category,
			search,
			artist,
			limit,
			pageNumber,
			orderBy: sort
		});

		return json({ data: result.data, total: result.total, error: null });
	} catch (error) {
		console.error('API Error:', error);
		return json(
			{ data: [], error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}
