import { readLibraryPassage } from '$lib/server/libraryPassage';
import { pageMeta } from '$lib/seo';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, setHeaders }) => {
	setHeaders({ 'cache-control': 'no-store', 'x-robots-tag': 'noindex, follow' });
	const passage = await readLibraryPassage(params.type, params.id, url.searchParams);
	return {
		...passage,
		meta: pageMeta(url.pathname, { title: passage.result.title, noindex: true })
	};
};
