import { listPublished } from '$lib/server/recordings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const pageNumber = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
	const { data, total } = await listPublished({ limit: 20, pageNumber });
	return { recordings: data, total, pageNumber, pageSize: 20 };
};
