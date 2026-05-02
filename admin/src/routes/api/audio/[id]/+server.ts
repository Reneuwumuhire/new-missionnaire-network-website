import { json } from '@sveltejs/kit';
import { getMusicAudioById, updateMusicAudio, deleteMusicAudio, logAudit } from '../../../../db/collections';
import { UpdateMusicAudioSchema } from '$lib/models/music-audio';
import { canManageMusicAudio, getPermissions } from '$lib/models/admin-user';
import { deleteObject } from '$lib/server/s3';
import type { RequestEvent } from './$types';

export async function GET({ locals, params }: RequestEvent) {
	if (!canManageMusicAudio(locals.user)) {
		return json({ data: null, error: 'Accès refusé' }, { status: 403 });
	}

	try {
		const audio = await getMusicAudioById(params.id);
		if (!audio) {
			return json({ data: null, error: 'Audio not found' }, { status: 404 });
		}
		return json({ data: audio, error: null });
	} catch (error) {
		console.error('API Error:', error);
		return json({ data: null, error: 'Server error' }, { status: 500 });
	}
}

export async function PATCH({ params, request, locals, getClientAddress }: RequestEvent) {
	const perms = getPermissions(locals.user);
	if (!perms.can_edit) {
		return json({ data: null, error: "Vous n'avez pas la permission de modifier des audios" }, { status: 403 });
	}

	try {
		const body = await request.json();
		const parsed = UpdateMusicAudioSchema.safeParse(body);
		if (!parsed.success) {
			return json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
		}

		// Get current state for audit diff
		const current = await getMusicAudioById(params.id);
		if (!current) {
			return json({ data: null, error: 'Audio not found' }, { status: 404 });
		}

		const updated = await updateMusicAudio(params.id, parsed.data, locals.user.email);
		if (!updated) {
			return json({ data: null, error: 'No changes made' }, { status: 400 });
		}

		// Build changes diff
		const changes: Record<string, { old: unknown; new: unknown }> = {};
		for (const [key, value] of Object.entries(parsed.data)) {
			const currentValue = current[key as keyof typeof current];
			if (currentValue !== value) {
				changes[key] = { old: currentValue, new: value };
			}
		}

		await logAudit({
			user_id: locals.user._id ?? locals.user.email,
			user_email: locals.user.email,
			action: 'update',
			target_collection: 'music_audio',
			target_id: params.id,
			changes: Object.keys(changes).length > 0 ? changes : null,
			ip_address: getClientAddress()
		});

		const refreshed = await getMusicAudioById(params.id);
		return json({ data: refreshed, error: null });
	} catch (error) {
		console.error('API Error:', error);
		return json({ data: null, error: 'Server error' }, { status: 500 });
	}
}

export async function DELETE({ params, locals, getClientAddress }: RequestEvent) {
	const permsD = getPermissions(locals.user);
	if (!permsD.can_delete) {
		return json({ data: null, error: "Vous n'avez pas la permission de supprimer des audios" }, { status: 403 });
	}

	try {
		const result = await deleteMusicAudio(params.id);
		if (!result) {
			return json({ data: null, error: 'Audio not found' }, { status: 404 });
		}

		// Delete from S3
		try {
			await deleteObject(result.s3_key);
		} catch (s3Error) {
			console.error('S3 delete error (record already removed from DB):', s3Error);
		}

		await logAudit({
			user_id: locals.user._id ?? locals.user.email,
			user_email: locals.user.email,
			action: 'delete',
			target_collection: 'music_audio',
			target_id: params.id,
			ip_address: getClientAddress()
		});

		return json({ data: { deleted: true }, error: null });
	} catch (error) {
		console.error('API Error:', error);
		return json({ data: null, error: 'Server error' }, { status: 500 });
	}
}
