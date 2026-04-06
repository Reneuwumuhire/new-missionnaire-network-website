import { json } from '@sveltejs/kit';
import { getMusicCategories } from '../../../db/collections';
import type { RequestEvent } from './$types';

export async function GET(_event: RequestEvent) {
	try {
		const categories = await getMusicCategories();
		return json({ data: categories, error: null });
	} catch (error) {
		console.error('Categories API Error:', error);
		return json({ data: [], error: 'Failed to fetch categories' }, { status: 500 });
	}
}
