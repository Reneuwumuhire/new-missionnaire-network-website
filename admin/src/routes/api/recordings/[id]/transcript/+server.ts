import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { getRecordingById } from '../../../../../db/collections';
import { getTranscriptPdfForRecording } from '$lib/server/video-sync';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	const recording = await getRecordingById(params.id);
	if (!recording) throw error(404, 'Enregistrement introuvable');

	const transcript = await getTranscriptPdfForRecording(recording);
	return json({ data: transcript });
};
