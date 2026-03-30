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

		// Exclude bots from all visitor-facing stats
		const noBotsFilter = { device: { $ne: 'Bot' } };

		const today = new Date().toISOString().split('T')[0];

		// Total unique visitors (distinct IPs, excluding bots)
		const uniqueIPs = await analytics.distinct('ip', noBotsFilter);
		const totalVisitors = uniqueIPs.length;

		// Unique visitors today (distinct IPs today, excluding bots)
		const todayUniqueIPs = await analytics.distinct('ip', { ...noBotsFilter, date: today });
		const todayVisitors = todayUniqueIPs.length;

		// Top Countries (excluding bots, counted by distinct IPs)
		const rawCountryStats = await analytics
			.aggregate([
				{ $match: noBotsFilter },
				{ $group: { _id: { ip: '$ip', country: { $ifNull: ['$countryFull', { $ifNull: ['$country', { $ifNull: ['$countryShort', 'Unknown'] }] }] } } } },
				{ $group: { _id: '$_id.country', count: { $sum: 1 } } }
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

		// Top Visited Pages (distinct IPs per page, excluding bots)
		const topPages = await analytics
			.aggregate([
				{ $match: noBotsFilter },
				{ $unwind: '$viewedPaths' },
				{ $group: { _id: { path: '$viewedPaths', ip: '$ip' } } },
				{ $group: { _id: '$_id.path', count: { $sum: 1 } } },
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

		// Device distribution (distinct IPs per device type, excluding bots)
		const deviceStats = await analytics
			.aggregate([
				{ $match: noBotsFilter },
				{ $group: { _id: { device: '$device', ip: '$ip' } } },
				{ $group: { _id: '$_id.device', count: { $sum: 1 } } },
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
