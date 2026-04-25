import { json } from '@sveltejs/kit';
import { getTranscriptionYears, queryTranscriptions } from '$lib/server/transcriptions';
import type { RequestEvent } from './$types';

export async function GET({ url }: RequestEvent) {
	try {
		const page = Number.parseInt(url.searchParams.get('page') || '1');
		const limit = Number.parseInt(url.searchParams.get('limit') || '12');
		const sort = url.searchParams.get('sort') === 'asc' ? 'asc' : 'desc';
		const year = url.searchParams.get('year');
		const search = url.searchParams.get('search');
		const includeYears = url.searchParams.get('includeYears') !== 'false';

		const [{ documents, total }, years] = await Promise.all([
			queryTranscriptions({ page, limit, sort, year, search }),
			includeYears ? getTranscriptionYears() : Promise.resolve([] as number[])
		]);

		return json({
			data: documents,
			total,
			years: includeYears ? years : undefined,
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
