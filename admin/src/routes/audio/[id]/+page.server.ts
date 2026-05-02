import { error } from '@sveltejs/kit';
import { getMusicAudioById, getMusicCategories, getMusicArtists } from '../../../db/collections';
import { canEditOrDeleteMusicAudio, getPermissions } from '$lib/models/admin-user';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!canEditOrDeleteMusicAudio(locals.user)) throw error(403, 'Accès refusé');
	const permissions = getPermissions(locals.user);

	const [audio, categories, artists] = await Promise.all([
		getMusicAudioById(params.id),
		getMusicCategories(),
		getMusicArtists()
	]);

	if (!audio) {
		throw error(404, 'Audio introuvable');
	}

	return {
		audio,
		categories,
		artists,
		canEdit: permissions.can_edit,
		canDelete: permissions.can_delete
	};
};
