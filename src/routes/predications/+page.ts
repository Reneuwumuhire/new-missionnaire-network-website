import { browser } from '$app/environment';
import type { Sermon } from '$lib/models/sermon';
import type { PublishedRecording } from '$lib/server/recordings';

const RETRANSMISSIONS_FILTER = 'Retransmissions';

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

export const load = async ({ fetch, url }) => {
	const author = url.searchParams.get('author') || 'Tous';
	const search = url.searchParams.get('search') || '';
	const alpha = url.searchParams.get('alpha') || '';
	const year = url.searchParams.get('year') || '';
	const hasAudio = url.searchParams.get('hasAudio') === 'true';
	const pageNumber = url.searchParams.get('page') || '1';
	const limit = url.searchParams.get('limit') || '100';
	const sort = url.searchParams.get('sort') || 'iso_date:desc';
	const language = url.searchParams.get('language') || 'french';

	const parsedPage = Number.parseInt(pageNumber);
	const parsedLimit = Number.parseInt(limit);

	const baseShape = {
		author,
		search,
		alpha,
		year,
		hasAudio,
		sort,
		language,
		page: parsedPage,
		limit: parsedLimit
	};

	if (browser) {
		return {
			...baseShape,
			filterType: 'sermon' as 'sermon' | 'retransmission',
			sermons: [] as Sermon[],
			recordings: [] as PublishedRecording[],
			recordingsTotal: 0,
			showBlendedRetransmissions: false,
			total: 0,
			years: [] as string[],
			availableAuthors: [] as string[],
			deferred: true
		};
	}

	const isRetransmissions = author === RETRANSMISSIONS_FILTER;
	const isBlendedSearch = author === 'Tous' && search.trim().length > 0;

	const sermonParams = new URLSearchParams({
		author,
		search,
		alpha,
		year,
		hasAudio: String(hasAudio),
		language,
		pageNumber,
		limit,
		sort
	});

	const sortMapped = sermonSortToRecordingSort(sort);
	const retransmissionLimit = isRetransmissions ? parsedLimit : 12;
	const retransmissionPage = isRetransmissions ? parsedPage : 1;
	const retransmissionParams = new URLSearchParams({
		limit: String(retransmissionLimit),
		pageNumber: String(retransmissionPage),
		sortField: sortMapped.field,
		sortOrder: sortMapped.order
	});
	if (search) retransmissionParams.set('q', search);
	if (year) retransmissionParams.set('year', year);

	const wantsSermons = !isRetransmissions;
	const wantsRetransmissions = isRetransmissions || isBlendedSearch;

	const [sermonRes, retransmissionRes, yearsRes, authorsRes] = await Promise.all([
		wantsSermons
			? fetch(`/api/sermons?${sermonParams.toString()}`)
			: Promise.resolve(null),
		wantsRetransmissions
			? fetch(`/api/retransmissions?${retransmissionParams.toString()}`)
			: Promise.resolve(null),
		fetch('/api/sermon-years'),
		fetch('/api/sermon-authors')
	]);

	let sermons: Sermon[] = [];
	let sermonTotal = 0;
	if (sermonRes && sermonRes.ok) {
		const r = await sermonRes.json();
		sermons = (r.data || []) as Sermon[];
		sermonTotal = (r.total || 0) as number;
	}

	let recordings: PublishedRecording[] = [];
	let recordingsTotal = 0;
	if (retransmissionRes && retransmissionRes.ok) {
		const r = await retransmissionRes.json();
		recordings = (r.data || []) as PublishedRecording[];
		recordingsTotal = (r.total || 0) as number;
	}

	let years: string[] = [];
	if (yearsRes.ok) {
		const r = await yearsRes.json();
		years = (r.data || []) as string[];
	}

	let availableAuthors: string[] = [];
	if (authorsRes.ok) {
		const r = await authorsRes.json();
		availableAuthors = (r.data || []) as string[];
	}

	return {
		...baseShape,
		filterType: (isRetransmissions ? 'retransmission' : 'sermon') as 'sermon' | 'retransmission',
		sermons,
		recordings,
		recordingsTotal,
		showBlendedRetransmissions: isBlendedSearch,
		total: isRetransmissions ? recordingsTotal : sermonTotal,
		years,
		availableAuthors,
		deferred: false
	};
};
