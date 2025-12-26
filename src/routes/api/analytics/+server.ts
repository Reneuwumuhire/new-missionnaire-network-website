import { json } from '@sveltejs/kit';
import { getDb } from '../../../db/mongo';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const db = await getDb();
		if (!db) {
			return json({ error: 'Database not connected' }, { status: 500 });
		}

		const analytics = db.collection('analytics');

		// Total unique daily visits
		const totalVisitors = await analytics.countDocuments();

		// Unique visitors today
		const today = new Date().toISOString().split('T')[0];
		const todayVisitors = await analytics.countDocuments({ date: today });

		// Top Countries
		const topCountries = await analytics
			.aggregate([
				{ $group: { _id: '$country', count: { $sum: 1 } } },
				{ $sort: { count: -1 } },
				{ $limit: 10 },
				{ $project: { name: '$_id', count: 1, _id: 0 } }
			])
			.toArray();

		// Device distribution
		const deviceStats = await analytics
			.aggregate([
				{ $group: { _id: '$device', count: { $sum: 1 } } },
				{ $sort: { count: -1 } },
				{ $project: { type: '$_id', count: 1, _id: 0 } }
			])
			.toArray();

		return json({
			totalVisitors,
			todayVisitors,
			topCountries,
			deviceStats
		});
	} catch (error) {
		console.error('[Analytics API Error]:', error);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
};
