import { json } from '@sveltejs/kit';
import { CreateMusicAudioSchema } from '$lib/models/music-audio';
import { getPermissions } from '$lib/models/admin-user';
import { createMusicAudio, checkDuplicateAudio, logAudit } from '../../../../db/collections';
import type { RequestEvent } from './$types';

export async function POST({ request, locals, getClientAddress }: RequestEvent) {
	const perms = getPermissions(locals.user);
	if (!perms.can_add) {
		return json({ data: null, error: "Vous n'avez pas la permission d'ajouter des audios" }, { status: 403 });
	}

	try {
		const body = await request.json();
		const parsed = CreateMusicAudioSchema.safeParse(body);
		if (!parsed.success) {
			return json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
		}

		const { title, artist, category, book, book_full_name, number, s3_key, s3_url, file_size, duration, format } =
			parsed.data;

		// Check for duplicates
		const duplicates = await checkDuplicateAudio(title, artist, file_size, format);
		const hasDuplicateWarning = duplicates.length > 0;

		const insertedId = await createMusicAudio({
			title,
			artist,
			category,
			book,
			book_full_name,
			number,
			s3_key,
			s3_url,
			file_size,
			duration,
			format,
			uploaded_by: locals.user.email
		});

		await logAudit({
			user_id: locals.user._id ?? locals.user.email,
			user_email: locals.user.email,
			action: 'create',
			target_collection: 'music_audio',
			target_id: insertedId,
			ip_address: getClientAddress()
		});

		return json({
			data: {
				_id: insertedId,
				duplicateWarning: hasDuplicateWarning
					? `${duplicates.length} doublon(s) potentiel(s) détecté(s)`
					: null
			},
			error: null
		});
	} catch (error) {
		console.error('Complete upload error:', error);
		return json({ data: null, error: 'Failed to save audio record' }, { status: 500 });
	}
}
