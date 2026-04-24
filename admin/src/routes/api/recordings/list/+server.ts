import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { listRecordings } from '../../../../db/collections';
import type { RecordingStatus } from '$lib/models/recording';

const VALID_STATUSES = new Set<RecordingStatus>(['recording', 'uploading', 'ready', 'failed']);

/** Paginated + searchable recordings list, called by the admin recordings
 *  page for live "load more" and search. The page-level loader returns just
 *  5 rows so first paint is fast; this endpoint serves everything after. */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit') ?? '5')), 100);
	const pageNumber = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
	const q = url.searchParams.get('q') ?? undefined;
	const rawStatus = url.searchParams.get('status');
	const status = rawStatus && VALID_STATUSES.has(rawStatus as RecordingStatus)
		? (rawStatus as RecordingStatus)
		: undefined;
	const rawPub = url.searchParams.get('published');
	const publishedFilter = rawPub === 'published' || rawPub === 'unpublished' ? rawPub : 'all';

	const result = await listRecordings({
		limit,
		pageNumber,
		q: q || undefined,
		status,
		publishedFilter
	});
	return json(result);
};
