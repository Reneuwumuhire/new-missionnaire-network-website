import { getDb } from '../../db/mongo';
import { dev } from '$app/environment';

export type AudienceRange = '5m' | 7 | 30 | 90;
export type AudienceData = {
	from: string;
	through: string;
	windowStartedAt: string | null;
	visitors: number;
	visits: number;
	pageVisits: number;
	daily: { date: string; visitors: number }[];
	minutes: { slot: number; visitors: number }[];
	topPages: { path: string; visitors: number }[];
	devices: { name: string; count: number }[];
	countries: { name: string; count: number }[];
	referrers: { name: string; count: number }[];
	plays: { kind: string; count: number }[];
	topSermons: { id: string; title: string; count: number }[];
	topSongs: { id: string; title: string; kind: string; count: number }[];
	topRecordings: { id: string; title: string; count: number }[];
};

type VisitFacet = {
	visitors: { count: number }[];
	visits: { count: number }[];
	pageVisits: { count: number }[];
	daily: { _id: string; count: number }[];
	pages: { _id: string; count: number }[];
	devices: { _id: string; count: number }[];
	countries: { _id: string; count: number }[];
	referrers: { _id: string; count: number }[];
};
type PlayFacet = {
	kinds: { _id: string; count: number }[];
	items: { _id: { kind: string; id: string }; title: string; count: number }[];
};

type RecentVisitFacet = {
	visitors: { count: number }[];
	pageVisits: { count: number }[];
	minutes: { _id: number; count: number }[];
	pages: { _id: string; count: number }[];
	devices: { _id: string; count: number }[];
	countries: { _id: string; count: number }[];
	referrers: { _id: string; count: number }[];
};

async function getRecentAudienceData(): Promise<AudienceData> {
	const now = Date.now();
	const cutoff = new Date(now - 5 * 60 * 1000);
	const today = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Africa/Kigali',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date(now));
	const db = await getDb();
	const [visitResult, playResult] = await Promise.all([
		db
			.collection(dev ? 'analytics_preview_page_events' : 'analytics_page_events')
			.aggregate<RecentVisitFacet>([
				{ $match: { occurredAt: { $gte: cutoff, $lt: new Date(now) } } },
				{
					$facet: {
						visitors: [{ $group: { _id: '$visitorId' } }, { $count: 'count' }],
						pageVisits: [{ $count: 'count' }],
						minutes: [
							{
								$group: {
									_id: {
										slot: { $floor: { $divide: [{ $subtract: ['$occurredAt', cutoff] }, 60_000] } },
										visitor: '$visitorId'
									}
								}
							},
							{ $group: { _id: '$_id.slot', count: { $sum: 1 } } },
							{ $sort: { _id: 1 } }
						],
						pages: [
							{ $group: { _id: '$path', count: { $sum: 1 } } },
							{ $sort: { count: -1 } },
							{ $limit: 10 }
						],
						devices: [
							{ $sort: { occurredAt: -1 } },
							{ $group: { _id: '$visitorId', value: { $first: '$device' } } },
							{ $group: { _id: '$value', count: { $sum: 1 } } },
							{ $sort: { count: -1 } },
							{ $limit: 6 }
						],
						countries: [
							{ $sort: { occurredAt: -1 } },
							{ $group: { _id: '$visitorId', value: { $first: '$country' } } },
							{ $group: { _id: '$value', count: { $sum: 1 } } },
							{ $sort: { count: -1 } },
							{ $limit: 6 }
						],
						referrers: [
							{ $sort: { occurredAt: 1 } },
							{ $group: { _id: '$visitorId', value: { $first: '$referrer' } } },
							{ $group: { _id: '$value', count: { $sum: 1 } } },
							{ $sort: { count: -1 } },
							{ $limit: 6 }
						]
					}
				}
			])
			.next(),
		db
			.collection(dev ? 'analytics_preview_play_events' : 'analytics_play_events')
			.aggregate<PlayFacet>([
				{ $match: { occurredAt: { $gte: cutoff, $lt: new Date(now) } } },
				{
					$group: {
						_id: { visitor: '$visitorId', kind: '$kind', id: '$itemId' },
						title: { $last: '$title' }
					}
				},
				{
					$facet: {
						kinds: [{ $group: { _id: '$_id.kind', count: { $sum: 1 } } }],
						items: [
							{
								$group: {
									_id: { kind: '$_id.kind', id: '$_id.id' },
									title: { $last: '$title' },
									count: { $sum: 1 }
								}
							},
							{ $sort: { count: -1 } },
							{ $limit: 1000 }
						]
					}
				}
			])
			.next()
	]);
	const visits = visitResult ?? {
		visitors: [],
		pageVisits: [],
		minutes: [],
		pages: [],
		devices: [],
		countries: [],
		referrers: []
	};
	const plays = playResult ?? { kinds: [], items: [] };
	const items = plays.items.map((row) => ({
		id: row._id.id,
		title: row.title,
		kind: row._id.kind,
		count: row.count
	}));
	return {
		from: today,
		through: today,
		windowStartedAt: cutoff.toISOString(),
		visitors: visits.visitors[0]?.count ?? 0,
		visits: visits.visitors[0]?.count ?? 0,
		pageVisits: visits.pageVisits[0]?.count ?? 0,
		daily: [],
		minutes: visits.minutes.map((row) => ({ slot: row._id, visitors: row.count })),
		topPages: visits.pages.map((row) => ({ path: row._id, visitors: row.count })),
		devices: visits.devices.map((row) => ({ name: row._id, count: row.count })),
		countries: visits.countries.map((row) => ({ name: row._id, count: row.count })),
		referrers: visits.referrers.map((row) => ({ name: row._id, count: row.count })),
		plays: plays.kinds.map((row) => ({ kind: row._id, count: row.count })),
		topSermons: items.filter((row) => row.kind === 'sermon').slice(0, 10),
		topSongs: items.filter((row) => row.kind === 'song' || row.kind === 'song_video').slice(0, 10),
		topRecordings: items.filter((row) => row.kind === 'recording').slice(0, 10)
	};
}

export async function getAudienceData(days: AudienceRange): Promise<AudienceData> {
	if (days === '5m') return getRecentAudienceData();
	const through = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Africa/Kigali',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date());
	const start = new Date(`${through}T00:00:00Z`);
	start.setUTCDate(start.getUTCDate() - days + 1);
	const from = start.toISOString().slice(0, 10);
	const end = new Date(`${through}T00:00:00Z`);
	end.setUTCDate(end.getUTCDate() + 1);
	const exclusiveEnd = end.toISOString().slice(0, 10);
	const db = await getDb();
	const [visitResult, playResult] = await Promise.all([
		db
			.collection('analytics')
			.aggregate<VisitFacet>(
				[
					{
						$match: {
							date: { $gte: from, $lte: through },
							device: { $ne: 'Bot' },
							$or: [{ verifiedHuman: true }, { pageViews: { $gt: 1 } }]
						}
					},
					{ $set: { visitorKey: { $ifNull: ['$visitorId', '$ip'] } } },
					{
						$facet: {
							visitors: [{ $group: { _id: '$visitorKey' } }, { $count: 'count' }],
							visits: [
								{ $group: { _id: { date: '$date', visitor: '$visitorKey' } } },
								{ $count: 'count' }
							],
							pageVisits: [
								{ $group: { _id: null, count: { $sum: { $ifNull: ['$pageViews', 0] } } } }
							],
							daily: [{ $group: { _id: '$date', count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
							pages: [
								{ $unwind: '$viewedPaths' },
								{ $match: { viewedPaths: { $type: 'string' } } },
								{ $group: { _id: '$viewedPaths', count: { $sum: 1 } } },
								{ $sort: { count: -1 } },
								{ $limit: 10 }
							],
							devices: [
								{ $group: { _id: { $ifNull: ['$device', 'Unknown'] }, count: { $sum: 1 } } },
								{ $sort: { count: -1 } },
								{ $limit: 6 }
							],
							countries: [
								{ $group: { _id: { $ifNull: ['$countryFull', 'Unknown'] }, count: { $sum: 1 } } },
								{ $sort: { count: -1 } },
								{ $limit: 6 }
							],
							referrers: [
								{ $group: { _id: { $ifNull: ['$referrer', 'direct'] }, count: { $sum: 1 } } },
								{ $sort: { count: -1 } },
								{ $limit: 6 }
							]
						}
					}
				],
				{ allowDiskUse: true }
			)
			.next(),
		db
			.collection('analytics_plays')
			.aggregate<PlayFacet>(
				[
					{ $match: { _id: { $gte: `${from}:`, $lt: `${exclusiveEnd}:` } } },
					{
						$facet: {
							kinds: [{ $group: { _id: '$kind', count: { $sum: 1 } } }],
							items: [
								{
									$group: {
										_id: { kind: '$kind', id: '$itemId' },
										title: { $last: '$title' },
										count: { $sum: 1 }
									}
								},
								{ $sort: { count: -1 } },
								{ $limit: 1000 }
							]
						}
					}
				],
				{ allowDiskUse: true }
			)
			.next()
	]);
	const visits = visitResult ?? {
		visitors: [],
		visits: [],
		pageVisits: [],
		daily: [],
		pages: [],
		devices: [],
		countries: [],
		referrers: []
	};
	const plays = playResult ?? { kinds: [], items: [] };
	const items = plays.items.map((row) => ({
		id: row._id.id,
		title: row.title,
		kind: row._id.kind,
		count: row.count
	}));
	return {
		from,
		through,
		windowStartedAt: null,
		visitors: visits.visitors[0]?.count ?? 0,
		visits: visits.visits[0]?.count ?? 0,
		pageVisits: visits.pageVisits[0]?.count ?? 0,
		daily: visits.daily.map((row) => ({ date: row._id, visitors: row.count })),
		minutes: [],
		topPages: visits.pages.map((row) => ({ path: row._id, visitors: row.count })),
		devices: visits.devices.map((row) => ({ name: row._id, count: row.count })),
		countries: visits.countries.map((row) => ({ name: row._id, count: row.count })),
		referrers: visits.referrers.map((row) => ({ name: row._id, count: row.count })),
		plays: plays.kinds.map((row) => ({ kind: row._id, count: row.count })),
		topSermons: items.filter((row) => row.kind === 'sermon').slice(0, 10),
		topSongs: items.filter((row) => row.kind === 'song' || row.kind === 'song_video').slice(0, 10),
		topRecordings: items.filter((row) => row.kind === 'recording').slice(0, 10)
	};
}
