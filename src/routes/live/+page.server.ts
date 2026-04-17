import { getRecentPublished } from '$lib/server/recordings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const recentRecordings = await getRecentPublished(5);
	return { recentRecordings };
};
