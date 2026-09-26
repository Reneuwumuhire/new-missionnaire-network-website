import { getDb } from '../../db/mongo';
import { getFullCountryName } from '../../utils/countries';
import { getTodayInKigali, monthOf } from '../../utils/time';

export type AnalyticsStats = {
	totalVisitors: number;
	todayVisitors: number;
	dailyAverage: number;
	monthlyAverage: number;
	topCountries: { name: string; count: number }[];
	deviceStats: { type: string; count: number }[];
};

type FacetResult = {
	totalVisitors?: { value: number }[];
	todayVisitors?: { value: number }[];
	dailyAverage?: { value: number }[];
	monthlyAverage?: { value: number }[];
	distributions?: { _id: { kind: 'country' | 'device'; value: string }; count: number }[];
};

export async function getAnalyticsStats(): Promise<AnalyticsStats> {
	const db = await getDb();
	const analytics = db.collection('analytics');
	const today = getTodayInKigali();
	const currentMonth = monthOf(today);
	const [result = {}] = (await analytics
		.aggregate(
			[
				{ $match: { device: { $ne: 'Bot' } } },
				{
					$facet: {
						totalVisitors: [{ $group: { _id: '$ip' } }, { $count: 'value' }],
						todayVisitors: [
							{ $match: { date: today } },
							{ $group: { _id: '$ip' } },
							{ $count: 'value' }
						],
						dailyAverage: [
							{ $match: { date: { $ne: today } } },
							{ $group: { _id: { date: '$date', ip: '$ip' } } },
							{ $group: { _id: '$_id.date', visitors: { $sum: 1 } } },
							{ $group: { _id: null, value: { $avg: '$visitors' } } }
						],
						monthlyAverage: [
							{ $match: { date: { $not: new RegExp(`^${currentMonth}`) } } },
							{ $project: { month: { $substrBytes: ['$date', 0, 7] }, ip: 1 } },
							{ $group: { _id: { month: '$month', ip: '$ip' } } },
							{ $group: { _id: '$_id.month', visitors: { $sum: 1 } } },
							{ $group: { _id: null, value: { $avg: '$visitors' } } }
						],
						distributions: [
							{ $sort: { ip: 1, lastSeen: -1 } },
							{
								$group: {
									_id: '$ip',
									device: { $first: { $ifNull: ['$device', 'Unknown'] } },
									country: {
										$first: {
											$ifNull: [
												'$countryShort',
												{ $ifNull: ['$country', { $ifNull: ['$countryFull', 'Unknown'] }] }
											]
										}
									}
								}
							},
							{
								$project: {
									metrics: [
										{ kind: { $literal: 'country' }, value: '$country' },
										{ kind: { $literal: 'device' }, value: '$device' }
									]
								}
							},
							{ $unwind: '$metrics' },
							{
								$group: {
									_id: { kind: '$metrics.kind', value: '$metrics.value' },
									count: { $sum: 1 }
								}
							},
							{ $sort: { count: -1 } }
						]
					}
				}
			],
			{ allowDiskUse: true }
		)
		.toArray()) as FacetResult[];

	const countryCounts = new Map<string, number>();
	const deviceStats: AnalyticsStats['deviceStats'] = [];
	for (const row of result.distributions || []) {
		if (row._id.kind === 'country') {
			const name = getFullCountryName(row._id.value || 'Unknown');
			countryCounts.set(name, (countryCounts.get(name) || 0) + row.count);
		} else {
			deviceStats.push({ type: row._id.value || 'Unknown', count: row.count });
		}
	}

	return {
		totalVisitors: Math.round(result.totalVisitors?.[0]?.value || 0),
		todayVisitors: Math.round(result.todayVisitors?.[0]?.value || 0),
		dailyAverage: Math.round(result.dailyAverage?.[0]?.value || 0),
		monthlyAverage: Math.round(result.monthlyAverage?.[0]?.value || 0),
		topCountries: [...countryCounts]
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 10),
		deviceStats
	};
}
