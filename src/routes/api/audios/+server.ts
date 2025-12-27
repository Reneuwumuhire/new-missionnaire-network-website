import { parseSearchParams } from '../../../utils/url';
import { queryAudios } from '../../../db/collections';
import { json } from '@sveltejs/kit';
import { ZodError, z } from 'zod';

const SearchAudioArgsSchema = z.object({
	searchTags: z
		.string()
		.optional()
		.transform((arg) => arg?.split(',').map((v) => v.trim())),
	limit: z.coerce.number().default(10),
	pageNumber: z.coerce.number().default(1),
	startDate: z.coerce.date().optional(),
	endDate: z.coerce.date().optional()
});

export async function GET({ url }) {
	try {
		const params = parseSearchParams(url);
		const parsedParams = SearchAudioArgsSchema.parse(params);

		const data = await queryAudios(parsedParams);
		return json({
			data,
			error: null
		});
	} catch (e) {
		let message = 'Invalid parameters';
		if (e instanceof ZodError) {
			message = e.issues.map((i) => `${i.code}: ${i.message}`).join(', ');
		} else if (e instanceof Error) {
			message = e.message;
		}
		return json({
			ok: false,
			error: message
		});
	}
}
