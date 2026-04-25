import { json } from '@sveltejs/kit';
import { listRetransmissions } from '$lib/server/recordings';
import type { RequestEvent } from './$types';

export async function GET({ url }: RequestEvent) {
	try {
		const limit = Number.parseInt(url.searchParams.get('limit') || '12');
		const pageNumber = Number.parseInt(url.searchParams.get('pageNumber') || '1');
		const q = url.searchParams.get('q') || undefined;
		const yearStr = url.searchParams.get('year');
		const year = yearStr ? Number.parseInt(yearStr) : undefined;
		const sortField = url.searchParams.get('sortField') || 'started_at';
		const sortOrder = url.searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';

		const result = await listRetransmissions({
			limit,
			pageNumber,
			q,
			year,
			sortField,
			sortOrder
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
				total: 0,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
}
