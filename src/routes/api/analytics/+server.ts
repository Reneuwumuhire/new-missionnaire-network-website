import { json } from '@sveltejs/kit';
import { getDb } from '../../../db/mongo';
import type { RequestHandler } from './$types';
import { getFullCountryName } from '../../../utils/countries';

export const GET: RequestHandler = async () => {
	try {
		const db = await getDb();
		if (!db) {
			return json({ error: 'Database not connected' }, { status: 500 });
		}

		const analytics = db.collection('analytics');
		const missedRoutes = db.collection('missed_routes');

		// Total unique daily visits
		const totalVisitors = await analytics.countDocuments();

		// Unique visitors today
		const today = new Date().toISOString().split('T')[0];
		const todayVisitors = await analytics.countDocuments({ date: today });

		// Top Countries (Handle legacy fields and map to full names)
		const rawCountryStats = await analytics
			.aggregate([
				{
					$group: {
						_id: {
							$ifNull: [
								'$countryFull',
								{ $ifNull: ['$country', { $ifNull: ['$countryShort', 'Unknown'] }] }
							]
						},
						count: { $sum: 1 }
					}
				}
			])
			.toArray();

		const countryDataMap = new Map<string, number>();
		(rawCountryStats as any[]).forEach((stat) => {
			const name = getFullCountryName(stat._id);
			countryDataMap.set(name, (countryDataMap.get(name) || 0) + stat.count);
		});

		const topCountries = Array.from(countryDataMap.entries())
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 10);

		// Top Visited Pages (Aggregated from viewedPaths)
		const topPages = await analytics
			.aggregate([
				{ $unwind: '$viewedPaths' },
				{ $group: { _id: '$viewedPaths', count: { $sum: 1 } } },
				{ $sort: { count: -1 } },
				{ $limit: 10 },
				{ $project: { path: '$_id', count: 1, _id: 0 } }
			])
			.toArray();

		// Top Missed Routes (404s)
		const topMissed = await missedRoutes
			.find({})
			.sort({ count: -1 })
			.limit(10)
			.project({ path: 1, count: 1, _id: 0 })
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
			topPages,
			topMissed,
			deviceStats
		});
	} catch (error) {
		console.error('[Analytics API Error]:', error);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
};
