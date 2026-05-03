import { error } from '@sveltejs/kit';
import { getMusicAudioById, getMusicCategories, getMusicArtists } from '../../../db/collections';
import { canManageMusicAudio, canReviewLyrics, getPermissions } from '$lib/models/admin-user';
import { getLyricsTimelineDetail } from '$lib/server/lyricsTimeline';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!canManageMusicAudio(locals.user) && !canReviewLyrics(locals.user)) {
		throw error(403, 'Accès refusé');
	}
	const permissions = getPermissions(locals.user);

	const [audio, categories, artists] = await Promise.all([
		getMusicAudioById(params.id),
		getMusicCategories(),
		getMusicArtists()
	]);

	if (!audio) {
		throw error(404, 'Audio introuvable');
	}

	const lyricsDetail = await getLyricsTimelineDetail(params.id).catch((caughtError) => {
		console.warn('[AudioDetail] Could not load lyrics detail:', caughtError);
		return null;
	});

	return {
		audio,
		categories,
		artists,
		canEdit: permissions.can_edit,
		canDelete: permissions.can_delete,
		canPublishLyrics: permissions.can_add || permissions.can_edit || permissions.can_review_lyrics,
		canReviewLyrics: permissions.can_review_lyrics,
		lyrics: lyricsDetail?.lyrics ?? null
	};
};
