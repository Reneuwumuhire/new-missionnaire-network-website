import { json } from '@sveltejs/kit';
import { getUpcomingVideos } from '../../../../db/collections';
import { ZodError } from 'zod';

export async function GET() {
	try {
		const data = await getUpcomingVideos();
		return json({
			data
		});
	} catch (error) {
		let message = 'error';
		if (error instanceof ZodError) {
			message = error.issues
				.map((e) => {
					return e.message;
				})
				.join(', ');
		} else if (error instanceof Error) message = error.message;
		return json(
			{
				message
			},
			{ status: 400 }
		);
	}
}
