import { json } from '@sveltejs/kit';
import { parseLibraryFilters } from '$lib/utils/librarySearch';
import { searchLibrary } from '$lib/server/librarySearch';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const headers = { 'cache-control': 'no-store' };
	let filters;
	try {
		filters = parseLibraryFilters(url.searchParams);
	} catch {
		return json({ error: 'Invalid search filters' }, { status: 400, headers });
	}
	try {
		return json(await searchLibrary(filters), { headers });
	} catch (error) {
		console.error('[library-search]', error);
		return json({ error: 'Search temporarily unavailable' }, { status: 503, headers });
	}
};
