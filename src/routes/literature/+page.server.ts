import type { PageServerLoad } from './$types';
import { queryLiterature } from '../../db/collections';
import type { Literature } from '$lib/models/literature';

export const load: PageServerLoad = async ({ url }) => {
	const author = url.searchParams.get('author') || 'Tous';
	const type = url.searchParams.get('category') || 'All';
	const language = url.searchParams.get('language') || 'french';
	const search = url.searchParams.get('search') || '';
	const pageNumber = url.searchParams.get('page') || '1';
	const limit = url.searchParams.get('limit') || '100';
	const sort = url.searchParams.get('sort') || 'release_date:desc';

	const fetchLiterature = async () => {
		try {
			const result = await queryLiterature({
				author,
				type,
				language,
				search,
				limit: Number.parseInt(limit),
				pageNumber: Number.parseInt(pageNumber),
				orderBy: sort
			});
			return result;
		} catch (error) {
			console.error('[Load] Error fetching literature:', error);
			return { data: [] as Literature[], total: 0 };
		}
	};

	const result = await fetchLiterature();

	return {
		literature: result.data,
		total: result.total,
		author,
		category: type,
		language,
		search,
		sort,
		page: Number.parseInt(pageNumber),
		limit: Number.parseInt(limit)
	};
};
