import type { PageServerLoad } from './$types';
import { querySermons, getSermonYears } from '../../db/collections';
import type { Sermon } from '$lib/models/sermon';

export const load: PageServerLoad = async ({ url }) => {
	const author = url.searchParams.get('author') || 'Tous';
	const search = url.searchParams.get('search') || '';
	const alpha = url.searchParams.get('alpha') || '';
	const year = url.searchParams.get('year') || '';
	const hasAudio = url.searchParams.get('hasAudio') === 'true';
	const pageNumber = url.searchParams.get('page') || '1';
	const limit = url.searchParams.get('limit') || '100';
	const sort = url.searchParams.get('sort') || 'iso_date:desc';

	const fetchYears = async () => {
		try {
			return await getSermonYears();
		} catch (e) {
			console.error('[Load] Error fetching years:', e);
			return [];
		}
	};

	const fetchSermons = async () => {
		try {
			const result = await querySermons({
				author,
				search,
				alpha,
				year,
				hasAudio,
				limit: Number.parseInt(limit),
				pageNumber: Number.parseInt(pageNumber),
				orderBy: sort
			});
			return result;
		} catch (error) {
			console.error('[Load] Error fetching sermons:', error);
			return { data: [] as Sermon[], total: 0 };
		}
	};

	const [years, result] = await Promise.all([fetchYears(), fetchSermons()]);

	return {
		sermons: result.data,
		total: result.total,
		years,
		author,
		search,
		alpha,
		year,
		hasAudio,
		sort,
		page: Number.parseInt(pageNumber),
		limit: Number.parseInt(limit)
	};
};
