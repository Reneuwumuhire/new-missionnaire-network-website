import type { PageServerLoad } from './$types';
import { querySermons, getSermonYears, getSermonAuthors } from '../../db/collections';
import type { Sermon } from '$lib/models/sermon';
import { listRetransmissions, type PublishedRecording } from '$lib/server/recordings';

/** Sentinel author value that switches the Prédications table from the
 *  curated sermons view to the live-broadcast archive (recordings). */
const RETRANSMISSIONS_FILTER = 'Retransmissions';

/** Map a sermon sort key ("french_title:asc") onto the equivalent recording
 *  field. Author column isn't sortable for retransmissions (single author),
 *  so it falls through to the default started_at sort. */
function sermonSortToRecordingSort(sort: string): { field: string; order: 'asc' | 'desc' } {
	const [property, order] = sort.split(':');
	const dir = order === 'asc' ? 'asc' : 'desc';
	switch (property) {
		case 'french_title':
			return { field: 'title', order: dir };
		case 'iso_date':
			return { field: 'started_at', order: dir };
		case 'duration':
			return { field: 'duration_sec', order: dir };
		default:
			return { field: 'started_at', order: 'desc' };
	}
}

export const load: PageServerLoad = async ({ url }) => {
	const author = url.searchParams.get('author') || 'Tous';
	const search = url.searchParams.get('search') || '';
	const alpha = url.searchParams.get('alpha') || '';
	const year = url.searchParams.get('year') || '';
	const hasAudio = url.searchParams.get('hasAudio') === 'true';
	const pageNumber = url.searchParams.get('page') || '1';
	const limit = url.searchParams.get('limit') || '100';
	const sort = url.searchParams.get('sort') || 'iso_date:desc';
	const language = url.searchParams.get('language') || 'french';

	const isRetransmissionsFilter = author === RETRANSMISSIONS_FILTER;
	// When the user runs a search on "Tout Voir" we also query retransmissions
	// so results aren't invisibly hidden behind a filter switch. Without this,
	// searching "2026-04-22" on Tout Voir shows nothing even though there's a
	// matching retransmission — the user would have to know to switch filters.
	const isBlendedSearch = author === 'Tous' && search.trim().length > 0;

	const fetchYears = async () => {
		try {
			return await getSermonYears();
		} catch (e) {
			console.error('[Load] Error fetching years:', e);
			return [];
		}
	};

	const fetchAuthors = async () => {
		try {
			return await getSermonAuthors();
		} catch (e) {
			console.error('[Load] Error fetching authors:', e);
			return [];
		}
	};

	const fetchSermons = async (): Promise<{ data: Sermon[]; total: number }> => {
		if (isRetransmissionsFilter) return { data: [], total: 0 };
		try {
			return await querySermons({
				author,
				search,
				alpha,
				year,
				hasAudio,
				limit: Number.parseInt(limit),
				pageNumber: Number.parseInt(pageNumber),
				orderBy: sort,
				language
			});
		} catch (error) {
			console.error('[Load] Error fetching sermons:', error);
			return { data: [], total: 0 };
		}
	};

	const fetchRetransmissions = async (): Promise<{
		data: PublishedRecording[];
		total: number;
	}> => {
		if (!isRetransmissionsFilter && !isBlendedSearch) return { data: [], total: 0 };
		try {
			const sortMapped = sermonSortToRecordingSort(sort);
			// Blended search: cap to a small preview (we surface matches below
			// the sermon table, not the full paginated list). When the user's
			// explicitly on the Retransmissions filter, honor the full page limit.
			const retransmissionLimit = isRetransmissionsFilter ? Number.parseInt(limit) : 12;
			const retransmissionPage = isRetransmissionsFilter ? Number.parseInt(pageNumber) : 1;
			return await listRetransmissions({
				limit: retransmissionLimit,
				pageNumber: retransmissionPage,
				q: search || undefined,
				year: year ? Number.parseInt(year) : undefined,
				sortField: sortMapped.field,
				sortOrder: sortMapped.order
			});
		} catch (error) {
			console.error('[Load] Error fetching retransmissions:', error);
			return { data: [], total: 0 };
		}
	};

	const [years, availableAuthors, sermonResult, retransmissionResult] = await Promise.all([
		fetchYears(),
		fetchAuthors(),
		fetchSermons(),
		fetchRetransmissions()
	]);

	const filterType: 'sermon' | 'retransmission' = isRetransmissionsFilter ? 'retransmission' : 'sermon';
	const total = isRetransmissionsFilter ? retransmissionResult.total : sermonResult.total;

	return {
		filterType,
		sermons: sermonResult.data,
		recordings: retransmissionResult.data,
		recordingsTotal: retransmissionResult.total,
		showBlendedRetransmissions: isBlendedSearch,
		total,
		years,
		availableAuthors,
		author,
		search,
		alpha,
		year,
		hasAudio,
		sort,
		language,
		page: Number.parseInt(pageNumber),
		limit: Number.parseInt(limit)
	};
};
