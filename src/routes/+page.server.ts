import db from '$lib/server/db';

/** @type {import('./$types').PageLoad} */
export async function load({ url }) {
	try {
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '20');
		const skip = (page - 1) * limit;

		const videosPromise = db.collection('videos').find({}).skip(skip).limit(limit).toArray();

		const totalCountPromise = db.collection('videos').countDocuments();

		const [videos, totalCount] = await Promise.all([videosPromise, totalCountPromise]);

		const totalPages = Math.ceil(totalCount / limit);

		// Serialize the videos
		const serializedVideos = videos.map((video) => ({
			...video,
			_id: video._id.toString()
			// Add any other fields that need special serialization here
		}));
		console.log(serializedVideos);
		return {
			videos: serializedVideos,
			pagination: {
				page,
				limit,
				totalCount,
				totalPages
			}
		};
	} catch (error) {
		console.error('Error fetching videos:', error);
		return { error: 'Failed to fetch videos' };
	}
}