import { json } from '@sveltejs/kit';
import { getVideosByDuration, getSongs, getSongsCount } from '../../../../db/collections';
import { ZodError, z } from 'zod';
import type { RequestEvent } from './$types';
const videoTypeSchema = z.enum(['predication', 'song']).optional();
const LONG_VIDEO = 600;

export async function GET({ url }: RequestEvent) {
	try {
		const videoType = videoTypeSchema.parse(url.searchParams.get('type') ?? undefined);
		let maxDuration;
		let minDuration;
		let limit = 5;
		if (url.searchParams.has('maxResults')) {
			limit = z.coerce.number().parse(url.searchParams.get('maxResults'));
		}
		let videos;
		let total = 0;
		const search = url.searchParams.get('search') ?? undefined;
		const skip = z.coerce.number().default(0).parse(url.searchParams.get('skip'));

		if (videoType === 'song') {
			const [items, count] = await Promise.all([
				getSongs({ limit, skip, search }),
				getSongsCount(search)
			]);
			videos = items;
			total = count;
		} else {
			if (videoType === 'predication') {
				minDuration = LONG_VIDEO;
			}
			videos = await getVideosByDuration({ limit, skip, maxDuration, minDuration });
		}

		return json({
			data: videos,
			total
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
