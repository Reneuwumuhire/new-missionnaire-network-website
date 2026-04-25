import { json } from '@sveltejs/kit';
import { getSermonAuthors } from '../../../db/collections';

export async function GET() {
	try {
		const authors = await getSermonAuthors();
		return json({
			data: authors,
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
