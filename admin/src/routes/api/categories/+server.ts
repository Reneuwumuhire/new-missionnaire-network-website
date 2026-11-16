import { verifyAdminSession } from '$lib/server/admin-session';
import { json } from '@sveltejs/kit';
import { getMusicCategories } from '../../../db/collections';
import { canManageMusicAudio } from '$lib/models/admin-user';
import type { RequestEvent } from './$types';

export async function GET({ cookies }: RequestEvent) {
	const adminUser = await verifyAdminSession(cookies);
	if (!canManageMusicAudio(adminUser)) {
		return json({ data: [], error: 'Accès refusé' }, { status: 403 });
	}

	try {
		const categories = await getMusicCategories();
		return json({ data: categories, error: null });
	} catch (error) {
		console.error('Categories API Error:', error);
		return json({ data: [], error: 'Failed to fetch categories' }, { status: 500 });
	}
}
