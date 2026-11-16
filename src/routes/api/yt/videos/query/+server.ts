import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { ZodError, z } from 'zod';
import { queryVideos } from '../../../../../db/collections';
import { parseSearchParams } from '../../../../../utils/url';
import { YoutubeVideoTagSchema } from '$lib/models/youtube';

const SearchTags = z.string()
	.max(250)
	.transform((value) => value.split(',').map((item) => item.trim()))
	.pipe(YoutubeVideoTagSchema.array());

const Params = z.object({
	searchTags: SearchTags.default(['any']),
	limit: z.coerce.number().int().min(1).max(1000).default(20),
	pageNumber: z.coerce.number().int().min(1).max(100_000).default(1),
	startDate: z.coerce.date().optional(),
	endDate: z.coerce.date().optional()
});

export async function GET({ url }: RequestEvent) {
	try {
		const params = parseSearchParams(url);
		const parsedParams = Params.parse(params);
		const videos = await queryVideos(parsedParams);
		return json({
			ok: true,
			value: videos
		});
	} catch (err) {
		let message = "That's an error :( \n failed to query videos";
		if (err instanceof ZodError) {
			message = err.issues.map((i) => `${i.code}: ${i.message}`).join(', ');
		} else if (err instanceof Error) {
			message = err.message;
		}

		error(400, message);
	}
}
