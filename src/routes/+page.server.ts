import type { PageServerLoad } from './$types';
import { getCollection } from '../db/collections';

export const load: PageServerLoad = async ({ url }) => {
    const filter = url.searchParams.get('filter') || 'All';
    const search = url.searchParams.get('search') || '';

    // Use the same parameters as pagination
    const videos = await getCollection('videos', 0, 20, filter, search);

    return {
        data: videos
    };
};