import { json } from '@sveltejs/kit';
import { getSermonYears } from '../../../db/collections';

export async function GET() {
	try {
		const years = await getSermonYears();
		return json({
			data: years,
			error: null
		});
	} catch (error) {
		console.error('API Error:', error);
		return json(
			{
				data: [],
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
}
