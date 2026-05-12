import {
	getAvailableYears,
	getPublishedTotal,
	listPublished,
	type RecordingType
} from '$lib/server/recordings';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 20;

function parseIntParam(value: string | null, min: number, max: number): number | undefined {
	if (!value) return undefined;
	const n = Number(value);
	if (!Number.isFinite(n) || n < min || n > max) return undefined;
	return Math.floor(n);
}

function parseTypeParam(value: string | null): RecordingType | undefined {
	if (value === 'retransmission' || value === 'local') return value;
	return undefined;
}

export const load: PageServerLoad = async ({ url }) => {
	const pageNumber = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
	const q = (url.searchParams.get('q') ?? '').trim();
	const year = parseIntParam(url.searchParams.get('year'), 1970, 3000);
	const month = parseIntParam(url.searchParams.get('month'), 1, 12);
	const type = parseTypeParam(url.searchParams.get('type'));

	const [{ data, total }, years, allTotal] = await Promise.all([
		listPublished({
			limit: PAGE_SIZE,
			pageNumber,
			q: q || undefined,
			year,
			month: year ? month : undefined,
			type
		}),
		getAvailableYears(),
		getPublishedTotal()
	]);

	return {
		recordings: data,
		total,
		allTotal,
		pageNumber,
		pageSize: PAGE_SIZE,
		filters: {
			q,
			year: year ?? null,
			month: year ? month ?? null : null,
			type: type ?? null
		},
		availableYears: years
	};
};
