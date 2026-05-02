import type { PageServerLoad } from './$types';
import { listPublicQuestions } from '../../db/questions';

const PAGE_SIZE = 12;

export const load: PageServerLoad = async ({ url }) => {
	const search = url.searchParams.get('search')?.trim() ?? '';
	const sort = url.searchParams.get('sort') ?? 'newest';
	const category = url.searchParams.get('category')?.trim() ?? '';
	const answered = url.searchParams.get('answered') ?? '';
	const from = url.searchParams.get('from') ?? '';
	const to = url.searchParams.get('to') ?? '';
	const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);

	try {
		const result = await listPublicQuestions({
			search,
			sort,
			category,
			answered,
			from,
			to,
			page,
			limit: PAGE_SIZE
		});

		return {
			questions: result.questions,
			total: result.total,
			categories: result.categories,
			page,
			limit: PAGE_SIZE,
			search,
			sort,
			category,
			answered,
			from,
			to,
			loadError: null as string | null
		};
	} catch (error) {
		console.error('[Questions] list load failed:', error);
		return {
			questions: [],
			total: 0,
			categories: [],
			page,
			limit: PAGE_SIZE,
			search,
			sort,
			category,
			answered,
			from,
			to,
			loadError: 'Impossible de charger les questions pour le moment.'
		};
	}
};
