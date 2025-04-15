import type { PDF } from '../../core/model/pdf';
import { getDb } from '../../db/mongo';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { ObjectId, type Filter } from 'mongodb';

export const load: PageServerLoad = async ({ url }) => {
	try {
		const page = Number(url.searchParams.get('page')) || 1;
		const limit = 12;
		const skip = (page - 1) * limit;
		const sortOrder = url.searchParams.get('sort') || 'desc';
		const selectedYear = url.searchParams.get('year');

		const db = await getDb();
		const collection = db.collection<PDF>('pdfs');

		// Get distinct years from publishedOn dates
		const allDocs = await collection.find().toArray();
		const years = [...new Set(allDocs.map(doc => 
			new Date(doc.publishedOn).getFullYear()
		))].sort((a, b) => b - a); // Sort years in descending order

		// Build query with proper typing
		const query: Filter<PDF> = {};
		const searchTerm = url.searchParams.get('search')?.trim();
		if (searchTerm) {
			query['filename'] = { $regex: searchTerm, $options: 'i' };
		 }

		// Add year filter if selected
		if (selectedYear) {
			const year = parseInt(selectedYear);
			query['publishedOn'] = {
				$gte: new Date(year, 0, 1),
				$lt: new Date(year + 1, 0, 1)
			};
		}

		// Get documents with pagination and sorting
		const documents = await collection
			.find(query)
			.sort({ 
				publishedOn: sortOrder === 'desc' ? -1 : 1,
				_id: sortOrder === 'desc' ? -1 : 1  // Secondary sort by _id to ensure consistent ordering
			})
			.skip(skip)
			.limit(limit)
			.toArray();

		// Get total count for pagination
		const total = await collection.countDocuments(query);

		// Convert MongoDB documents to plain objects and stringify ALL ObjectIds
		const serializedDocuments = await Promise.all(documents.map(async (doc) => {
			const serialized = { ...doc } as PDF & { videoDisplayId?: string };

			// Convert _id to string
			if (serialized._id) {
				serialized._id = serialized._id.toString();
			}

			// Convert videoId to string if it exists and is an ObjectId
			if (serialized.videoId && typeof serialized.videoId.toString === 'function') {
				serialized.videoId = serialized.videoId.toString();
			}

			// If there's a videoId, try to get the video ID from videos collection
			if (serialized.videoId) {
				const videosCollection = db.collection('videos');
				const video = await videosCollection.findOne({ _id: new ObjectId(serialized.videoId) });
				if (video?.id) {
					serialized.videoDisplayId = video.id;
				}
			}

			return serialized;
		}));

		return {
			documents: serializedDocuments,
			pagination: {
				page,
				limit,
				total
			},
			sort: sortOrder,
			years,
			selectedYear
		};
	} catch (err) {
		console.error('Error loading documents:', err);
		throw error(500, {
			message: 'Failed to load documents. Please check your MongoDB connection.'
		});
	}
};
