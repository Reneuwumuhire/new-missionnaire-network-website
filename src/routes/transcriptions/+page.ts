import { browser } from '$app/environment';
import type { SerializedTranscription } from '$lib/server/transcriptions';

export const load = async ({ fetch, url }) => {
	const page = Number(url.searchParams.get('page')) || 1;
	const limit = 12;
	const sortOrder = url.searchParams.get('sort') === 'asc' ? 'asc' : 'desc';
	const selectedYear = url.searchParams.get('year');
	const searchTerm = url.searchParams.get('search');

	const baseShape = {
		search: searchTerm || '',
		sort: sortOrder as 'asc' | 'desc',
		selectedYear,
		pagination: { page, limit, total: 0 }
	};

	if (browser) {
		return {
			...baseShape,
			documents: [] as SerializedTranscription[],
			years: [] as number[],
			deferred: true
		};
	}

	const params = new URLSearchParams({
		page: String(page),
		limit: String(limit),
		sort: sortOrder
	});
	if (selectedYear) params.set('year', selectedYear);
	if (searchTerm) params.set('search', searchTerm);

	const res = await fetch(`/api/transcriptions?${params.toString()}`);
	if (!res.ok) {
		return {
			...baseShape,
			documents: [] as SerializedTranscription[],
			years: [] as number[],
			deferred: false
		};
	}
	const r = await res.json();
	const documents = (r.data || []) as SerializedTranscription[];
	const years = (r.years || []) as number[];
	const total = (r.total || 0) as number;

	return {
		search: searchTerm || '',
		sort: sortOrder as 'asc' | 'desc',
		selectedYear,
		pagination: { page, limit, total },
		documents,
		years,
		deferred: false
	};
};
