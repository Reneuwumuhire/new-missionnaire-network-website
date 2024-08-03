// src/routes/api/videos/+server.ts
import db from '$lib/server/db';
import { json } from '@sveltejs/kit';

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
	try {
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '10');
		const skip = (page - 1) * limit;
		const tags = url.searchParams.get('tags')?.split(',').filter(Boolean) || [];

		let query = {};
		if (tags.length > 0) {
			query = { tags: { $all: tags } };
		}

		const videosPromise = db.collection('videos').find(query).skip(skip).limit(limit).toArray();
		const totalCountPromise = db.collection('videos').countDocuments(query);

		const [videos, totalCount] = await Promise.all([videosPromise, totalCountPromise]);

		const totalPages = Math.ceil(totalCount / limit);

		// Serialize the videos
		const serializedVideos = videos.map((video) => ({
			...video,
			_id: video._id.toString()
			// Add any other fields that need special serialization here
		}));

		return json({
			videos: serializedVideos,
			pagination: {
				page,
				limit,
				totalCount,
				totalPages
			}
		});
	} catch (error) {
		console.error('Error fetching videos:', error);
		return json({ error: 'Failed to fetch videos' }, { status: 500 });
	}
}
