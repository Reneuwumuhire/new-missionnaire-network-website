import { json } from '@sveltejs/kit';
import { querySermons, queryMusicAudio } from '../../../db/collections';
import { queryTranscriptions } from '$lib/server/transcriptions';
import { listPublished } from '$lib/server/recordings';
import type { RequestEvent } from './$types';

const GROUP_LIMIT = 5;

/**
 * Unified site search: fans out to the four content collections in
 * parallel and returns the top matches per group. Backs the header
 * GlobalSearch overlay.
 */
export async function GET({ url, setHeaders }: RequestEvent) {
	// CDN-cache identical queries so repeated searches (and multiple users
	// typing the same words) don't each invoke the function + 4 DB queries.
	setHeaders({ 'cache-control': 'public, s-maxage=300, stale-while-revalidate=3600' });

	const q = (url.searchParams.get('q') || '').trim();
	if (q.length < 2) {
		return json({
			sermons: [],
			songs: [],
			transcriptions: [],
			recordings: [],
			totals: { sermons: 0, songs: 0, transcriptions: 0, recordings: 0 },
			error: null
		});
	}

	try {
		const [sermons, songs, transcriptions, recordings] = await Promise.all([
			querySermons({ search: q, limit: GROUP_LIMIT, pageNumber: 1 }).catch(() => ({
				data: [],
				total: 0
			})),
			queryMusicAudio({ search: q, limit: GROUP_LIMIT, pageNumber: 1 }).catch(() => ({
				data: [],
				total: 0
			})),
			queryTranscriptions({ page: 1, limit: GROUP_LIMIT, search: q }).catch(() => ({
				documents: [],
				total: 0
			})),
			// All published recordings (both local meetings and retransmissions),
			// not just retransmissions — otherwise a local-preacher search like
			// "Chauffeur" misses the local rediffusions shown at
			// /live/rediffusions?type=local.
			listPublished({ q, limit: GROUP_LIMIT, pageNumber: 1 }).catch(() => ({
				data: [],
				total: 0
			}))
		]);

		return json({
			sermons: sermons.data.map((s) => ({
				_id: (s as { _id?: unknown })._id,
				french_title: s.french_title,
				english_title: s.english_title,
				iso_date: (s as { iso_date?: string }).iso_date,
				date_code: (s as { date_code?: string }).date_code,
				full_date_code: (s as { full_date_code?: string }).full_date_code
			})),
			songs: songs.data.map((m) => ({
				_id: (m as { _id?: unknown })._id,
				title: m.title,
				artist: m.artist
			})),
			transcriptions: transcriptions.documents.map((d) => ({
				_id: d._id,
				filename: d.filename,
				videoDisplayId: d.videoDisplayId
			})),
			recordings: recordings.data.map((r) => ({
				id: r.id,
				title: r.title,
				started_at: r.started_at
			})),
			totals: {
				sermons: sermons.total,
				songs: songs.total,
				transcriptions: transcriptions.total,
				recordings: recordings.total
			},
			error: null
		});
	} catch (error) {
		console.error('[api/search]', error);
		return json(
			{
				sermons: [],
				songs: [],
				transcriptions: [],
				recordings: [],
				totals: { sermons: 0, songs: 0, transcriptions: 0, recordings: 0 },
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
}
