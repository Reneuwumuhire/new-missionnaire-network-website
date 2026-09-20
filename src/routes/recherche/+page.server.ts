import { parseLibraryFilters } from '$lib/utils/librarySearch';
import { searchLibrary } from '$lib/server/librarySearch';
import { pageMeta } from '$lib/seo';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	setHeaders({ 'cache-control': 'no-store' });
	let filters = parseLibraryFilters(new URLSearchParams());
	let failure: 'invalid' | 'unavailable' | null = null;
	let result = { results: [], total: 0, page: 1, pages: 0 } as Awaited<
		ReturnType<typeof searchLibrary>
	>;
	try {
		filters = parseLibraryFilters(url.searchParams);
	} catch {
		failure = 'invalid';
	}
	if (!failure) {
		try {
			result = await searchLibrary(filters);
		} catch (error) {
			console.error('[library-search]', error);
			failure = 'unavailable';
		}
	}
	return {
		filters,
		result,
		failure,
		meta: pageMeta('/recherche', {
			title: 'Recherche dans la bibliothèque - Missionnaire Network',
			noindex: true
		})
	};
};
