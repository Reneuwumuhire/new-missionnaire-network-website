import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { incrementViewCount } from '$lib/server/recordings';

/** Fire-and-forget view counter for a published rediffusion. The detail page
 *  calls this from the browser after it has already rendered, so the page's
 *  SSR/TTFB is untouched. A single indexed `$inc` — cheap and non-blocking.
 *  Returns the new count (handy for an optimistic UI bump); never errors hard
 *  so a tracking failure can't surface to the listener. */
export const POST: RequestHandler = async ({ params }) => {
	const count = await incrementViewCount(params.id);
	return json({ view_count: count }, { headers: { 'cache-control': 'no-store' } });
};
