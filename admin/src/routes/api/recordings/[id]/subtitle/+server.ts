import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { getRecordingById } from '../../../../../db/collections';

// Server-side proxy of a recording's replay SRT for the trim editor's subtitle
// sync panel — avoids depending on S3 CORS for browser GETs.
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');
	if (!params.id) throw error(400, 'ID manquant');

	const recording = await getRecordingById(params.id);
	if (!recording) throw error(404, 'Enregistrement introuvable');
	if (!recording.subtitle_srt_url) throw error(404, 'Aucun sous-titre attaché');

	const res = await fetch(recording.subtitle_srt_url);
	if (!res.ok) throw error(502, 'Sous-titre inaccessible sur S3');
	const text = await res.text();
	return new Response(text, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'private, max-age=60'
		}
	});
};
