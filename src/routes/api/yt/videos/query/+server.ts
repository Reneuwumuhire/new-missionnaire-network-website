import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { ZodError, z } from 'zod';
import { queryVideos } from '../../../../../db/collections';
import { parseSearchParams } from '../../../../../utils/url';
import { YoutubeVideoTagSchema } from '$lib/models/youtube';

const SearchTags = z
	.string()
	.optional()
	.transform((arg, ctx) => {
		if (!arg) return undefined;
		try {
			const values = arg.split(',').map((v) => v.trim());
			const parsedValue = YoutubeVideoTagSchema.array().parse(values);
			return parsedValue;
		} catch (error) {
			ctx.addIssue({
				code: 'invalid_type',
				message: `search tag should be any of the following: ${Object.values(
					YoutubeVideoTagSchema.enum
				).join(', ')}`,
				expected: 'array',
				received: 'string'
			});
			return z.NEVER;
		}
	});

const Params = z.object({
	searchTags: SearchTags.default('any'),
	limit: z.coerce.number().default(20),
	pageNumber: z.coerce.number().default(1),
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

		throw error(400, message);
	}
}
