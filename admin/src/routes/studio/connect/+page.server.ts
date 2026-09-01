import { error } from '@sveltejs/kit';
import { getDb } from '../../../db/mongo';
import { getPermissions } from '$lib/models/admin-user';
import { revokeMissionnaireIngest } from '$lib/server/studio-ingest';
import type { Actions, PageServerLoad } from './$types';

function codeFrom(url: URL): string {
	const code = url.searchParams.get('code') ?? '';
	if (!/^[0-9a-f-]{36}$/i.test(code)) throw error(400, 'Invalid Studio connection code');
	return code;
}

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!getPermissions(locals.user).can_manage_recordings)
		throw error(403, 'Recording permission required');
	return { code: codeFrom(url), name: locals.user.name };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!getPermissions(locals.user).can_manage_recordings)
			throw error(403, 'Recording permission required');
		const form = await request.formData();
		const code = form.get('code')?.toString() ?? '';
		if (!/^[0-9a-f-]{36}$/i.test(code)) throw error(400, 'Invalid Studio connection code');
		const now = new Date();
		const db = await getDb();
		// Re-approving a pairing code must not transfer a previously issued key
		// to another admin account.
		await revokeMissionnaireIngest(code);
		await db.collection('studio_authorizations').updateOne(
			{ code },
			{
				$set: {
					code,
					user_email: locals.user.email,
					user_name: locals.user.name,
					approved_at: now,
					expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
				},
				$unset: { revoked_at: '', device: '', last_seen_at: '', last_used_at: '' }
			},
			{ upsert: true }
		);
		return { approved: true };
	}
};
