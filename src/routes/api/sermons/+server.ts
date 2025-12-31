import { json } from '@sveltejs/kit';
import { querySermons } from '../../../db/collections';
import type { RequestEvent } from './$types';

export async function GET({ url }: RequestEvent) {
	try {
		const author = url.searchParams.get('author') ?? undefined;
		const search = url.searchParams.get('search') ?? undefined;
		const alpha = url.searchParams.get('alpha') ?? undefined;
		const year = url.searchParams.get('year') ?? undefined;
		const limit = Number.parseInt(url.searchParams.get('limit') || '20');
		const pageNumber = Number.parseInt(url.searchParams.get('pageNumber') || '1');
		const sort = url.searchParams.get('sort') || 'iso_date:desc';

		const result = await querySermons({
			author,
			search,
			alpha,
			year,
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
