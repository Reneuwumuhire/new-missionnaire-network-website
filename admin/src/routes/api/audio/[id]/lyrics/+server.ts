import { verifyAdminSession } from '$lib/server/admin-session';
import { json } from '@sveltejs/kit';
import { canManageMusicAudio, canReviewLyrics, getPermissions } from '$lib/models/admin-user';
import { getLyricsTimelineDetail, publishManualLyricsForAudio } from '$lib/server/lyricsTimeline';
import type { RequestEvent } from './$types';

export async function GET(event: RequestEvent) {
	const adminUser = await verifyAdminSession(event.cookies);
	if (!canManageMusicAudio(adminUser) && !canReviewLyrics(adminUser)) {
		return json({ data: null, error: 'Accès refusé' }, { status: 403 });
	}

	try {
		const detail = await getLyricsTimelineDetail(event.params.id);
		return json({ data: detail.lyrics, error: null });
	} catch (error) {
		console.error('[AudioLyrics] Load error:', error);
		return json(
			{
				data: null,
				error: error instanceof Error ? error.message : 'Could not load audio lyrics'
			},
			{ status: 400 }
		);
	}
}

export async function POST(event: RequestEvent) {
	const adminUser = await verifyAdminSession(event.cookies);
	if (!getPermissions(adminUser).can_edit && !canReviewLyrics(adminUser)) {
		return json({ data: null, error: 'Accès refusé' }, { status: 403 });
	}

	try {
		const body = await event.request.json();
		const result = await publishManualLyricsForAudio({
			audioId: event.params.id,
			lyricsText: String(body.lyricsText ?? ''),
			sourceBook: String(body.sourceBook ?? ''),
			sourceNumber: String(body.sourceNumber ?? ''),
			sourceTitle: String(body.sourceTitle ?? ''),
			sourceUrl: String(body.sourceUrl ?? ''),
			title: String(body.title ?? ''),
			updatedBy: adminUser.email
		});

		return json({ data: result, error: null });
	} catch (error) {
		console.error('[AudioLyrics] Publish error:', error);
		return json(
			{
				data: null,
				error: error instanceof Error ? error.message : 'Could not publish audio lyrics'
			},
			{ status: 400 }
		);
	}
}
