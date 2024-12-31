import { json } from '@sveltejs/kit';
import { getCollection } from '../../db/collections';

export const GET = async ({ url }) => {
    const startTime = performance.now();

    try {
        const skip = parseInt(url.searchParams.get('skip') || '0');
        const filter = url.searchParams.get('filter') || 'All';
        const search = url.searchParams.get('search') || '';
        const limit = 20;

        console.log('[API] Received request:', { skip, filter, search, limit });

        const videos = await getCollection('videos', skip, limit, filter, search);

        const response = {
            data: videos,
            timing: performance.now() - startTime,
            params: { skip, filter, search, limit }
        };

        console.log('[API] Sending response:', {
            resultCount: videos.length,
            timing: response.timing
        });

        return json(response);
    } catch (error) {
        console.error('[API] Error processing request:', error);
        return json({
            error: 'Failed to fetch videos',
            details: error instanceof Error ? error.message : 'Unknown error',
            data: []
        }, { status: 500 });
    }
};