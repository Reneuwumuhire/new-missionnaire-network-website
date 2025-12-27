import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { ZodError, z } from 'zod';
import { getCollection } from '../../../../../db/collections';
import { parseSearchParams } from '../../../../../utils/url';

const Params = z.object({
	limit: z.coerce.number().default(20),
	pageNumber: z.coerce.number().default(1),
	query: z.string()
});

export async function GET({ url }: RequestEvent) {
	try {
		const params = parseSearchParams(url, Params);
		const { limit, pageNumber, query } = params as z.infer<typeof Params>;
		const skip = (pageNumber - 1) * limit;

		const videos = await getCollection('videos', skip, limit, undefined, query);

		return json({
			ok: true,
			value: videos
		});
	} catch (err) {
		let message = "That's an error :( \n failed to query videos";
		if (err instanceof ZodError) {
			message = err.issues.map((i) => `${i.code}: '${i.path}' ${i.message}`).join(', ');
		} else if (err instanceof Error) {
			message = err.message;
		}
		throw error(400, message);
	}
}
