import { json } from '@sveltejs/kit';
import { queryMusicAudio } from '../../../db/collections';
import type { RequestEvent } from './$types';

export async function GET({ url }: RequestEvent) {
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

		const result = await queryMusicAudio({
			category,
			search,
			alpha,
			artist,
			number,
			limit,
			pageNumber,
			orderBy: sort
		});

		return json({
			data: result.data,
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
