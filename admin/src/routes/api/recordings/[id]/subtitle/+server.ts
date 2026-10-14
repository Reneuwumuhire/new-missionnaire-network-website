import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { getRecordingById } from '../../../../../db/collections';
import { resolveRecordingSubtitle } from '$lib/server/recording-subtitle';
import { getObjectBytes } from '$lib/server/s3';

// Admin preview of a replay SRT, including subtitles inherited from the
// linked scheduled live. Server-side access avoids depending on S3 CORS.
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');
	if (!params.id) throw error(400, 'ID manquant');

	const recording = await getRecordingById(params.id);
	if (!recording) throw error(404, 'Enregistrement introuvable');
	const subtitle = await resolveRecordingSubtitle(recording);
	if (!subtitle) throw error(404, 'Aucun sous-titre attaché');

	let text: string;
	try {
		const { bytes } = await getObjectBytes(subtitle.key);
		text = new TextDecoder('utf-8').decode(bytes);
	} catch {
		throw error(502, 'Sous-titre inaccessible sur S3');
	}
	return new Response(text, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'private, no-store'
		}
	});
};
