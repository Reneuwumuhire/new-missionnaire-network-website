import { browser } from '$app/environment';
import type { SerializedTranscription } from '$lib/server/transcriptions';
import { pageMeta } from '$lib/seo';

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
		pagination: { page, limit, total: 0 },
		// Rendered by the root layout as the single og:*/twitter:* tag set.
		meta: pageMeta('/transcriptions', {
			title: 'Transcriptions - Missionnaire Network',
			description:
				'Recherchez les transcriptions des prédications du Message par année et par titre, pour étude et édification.'
		})
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
		...baseShape,
		pagination: { page, limit, total },
		documents,
		years,
		deferred: false
	};
};
