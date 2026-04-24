import { json } from '@sveltejs/kit';
import { getDb } from '../../../db/mongo';
import type { RequestHandler } from './$types';
import { getFullCountryName } from '../../../utils/countries';
import { getTodayInKigali, monthOf } from '../../../utils/time';

export const GET: RequestHandler = async () => {
	try {
		const db = await getDb();
		if (!db) {
			return json({ error: 'Database not connected' }, { status: 500 });
		}

		const analytics = db.collection('analytics');
		const missedRoutes = db.collection('missed_routes');

		const noBotsFilter = { device: { $ne: 'Bot' } };
		const today = getTodayInKigali();
		const currentMonth = monthOf(today);

		// Cumulative visitors: distinct IPs ever recorded (excluding bots).
		// Note: counts distinct IPs, not individuals — the label on the page
		// reflects this ("Visiteurs cumulés").
		const uniqueIPs = await analytics.distinct('ip', noBotsFilter);
		const totalVisitors = uniqueIPs.length;

		// Today's visitors: distinct IPs seen today in Kigali time.
		const todayUniqueIPs = await analytics.distinct('ip', { ...noBotsFilter, date: today });
		const todayVisitors = todayUniqueIPs.length;

		// Daily average: distinct IPs per *completed* day, averaged. We exclude
		// today because the in-progress day would otherwise depress the mean.
		const dailyStats = await analytics
			.aggregate([
				{ $match: { ...noBotsFilter, date: { $ne: today } } },
				{ $group: { _id: { date: '$date', ip: '$ip' } } },
				{ $group: { _id: '$_id.date', uniqueVisitors: { $sum: 1 } } },
				{
					$group: {
						_id: null,
						totalDays: { $sum: 1 },
						totalDailyVisitors: { $sum: '$uniqueVisitors' }
					}
				}
			])
			.toArray();

		const dailyAverage =
			dailyStats.length > 0
				? Math.round(dailyStats[0].totalDailyVisitors / dailyStats[0].totalDays)
				: 0;

		// Monthly average: distinct IPs per *completed* month, averaged.
		// The current month is excluded for the same reason as today.
		const monthlyStats = await analytics
			.aggregate([
				{ $match: noBotsFilter },
				{ $addFields: { month: { $substr: ['$date', 0, 7] } } },
				{ $match: { month: { $ne: currentMonth } } },
				{ $group: { _id: { month: '$month', ip: '$ip' } } },
				{ $group: { _id: '$_id.month', uniqueVisitors: { $sum: 1 } } },
				{
					$group: {
						_id: null,
						totalMonths: { $sum: 1 },
						totalMonthlyVisitors: { $sum: '$uniqueVisitors' }
					}
				}
			])
			.toArray();

		const monthlyAverage =
			monthlyStats.length > 0
				? Math.round(monthlyStats[0].totalMonthlyVisitors / monthlyStats[0].totalMonths)
				: 0;

		// Top countries & device distribution: collapse each IP to one record
		// (its most recent) before bucketing. Without this, the same IP that
		// switched devices or VPN'd into another country is counted in every
		// bucket it ever appeared in — so Desktop + Mobile + Tablet can exceed
		// the total unique-visitor count.
		const perIpCanonical = await analytics
			.aggregate([
				{ $match: noBotsFilter },
				{ $sort: { ip: 1, lastSeen: -1 } },
				{
					$group: {
						_id: '$ip',
						device: { $first: '$device' },
						countryShort: { $first: '$countryShort' },
						countryFull: { $first: '$countryFull' },
						country: { $first: '$country' }
					}
				}
			])
			.toArray();

		const countryCounts = new Map<string, number>();
		const deviceCounts = new Map<string, number>();
		for (const row of perIpCanonical as Array<{
			device?: string;
			countryShort?: string;
			countryFull?: string;
			country?: string;
		}>) {
			const code = row.countryShort || row.country || '';
			const name = code ? getFullCountryName(code) : row.countryFull || 'Unknown';
			countryCounts.set(name, (countryCounts.get(name) || 0) + 1);
			const device = row.device || 'Unknown';
			deviceCounts.set(device, (deviceCounts.get(device) || 0) + 1);
		}

		const topCountries = Array.from(countryCounts.entries())
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 10);

		const deviceStats = Array.from(deviceCounts.entries())
			.map(([type, count]) => ({ type, count }))
			.sort((a, b) => b.count - a.count);

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

		return json({
			totalVisitors,
			todayVisitors,
			dailyAverage,
			monthlyAverage,
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
