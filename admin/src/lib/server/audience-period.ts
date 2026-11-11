export const RECENT_RANGES = {
	'5m': { minutes: 5, bucketMinutes: 1 },
	'15m': { minutes: 15, bucketMinutes: 1 },
	'30m': { minutes: 30, bucketMinutes: 2 },
	'1h': { minutes: 60, bucketMinutes: 5 },
	'4h': { minutes: 240, bucketMinutes: 15 },
	'1d': { minutes: 1_440, bucketMinutes: 60 },
	'2d': { minutes: 2_880, bucketMinutes: 120 }
} as const;

export type RecentRange = keyof typeof RECENT_RANGES;
export type AudienceRange =
	| RecentRange
	| '7'
	| '30'
	| '90'
	| 'today'
	| 'yesterday'
	| 'week_to_date'
	| 'previous_week'
	| 'month_to_date'
	| 'previous_month'
	| 'year_to_date'
	| 'previous_year'
	| 'custom';

export type AudiencePeriod = {
	key: AudienceRange;
	from: string;
	through: string;
	recentMinutes: number | null;
	bucketMinutes: number;
	bucketCount: number;
};

// Public page routes from the website. This keeps scanner paths out of the
// selector while allowing recorded sermon, song, replay, and article pages.
export const STATIC_AUDIENCE_ROUTES = [
	'/',
	'/transcriptions',
	'/musique',
	'/live',
	'/live/rediffusions',
	'/predications',
	'/literature',
	'/videos',
	'/questions',
	'/publications',
	'/recherche',
	'/a-propos',
	'/eglise',
	'/ewald-frank',
	'/william-branham',
	'/william-branham/biographie',
	'/musique/videos',
	'/musique/instrumental',
	'/documents',
	'/extraits',
	'/studio',
	'/privacy',
	'/terms',
	'/questions/ask'
] as const;

const dynamicAudienceRoutes = [
	/^\/questions\/[^/]+$/u,
	/^\/predications\/[^/]+$/u,
	/^\/musique\/[^/]+$/u,
	/^\/live\/[A-Za-z0-9_-]{8,16}$/u,
	/^\/live\/rediffusions\/[0-9a-f]{24}$/u,
	/^\/publications\/[^/]+$/u,
	/^\/lecture\/[^/]+\/[^/]+$/u,
	/^\/extraits\/[^/]+$/u
];

export function isAudiencePageRoute(route: string): boolean {
	return (
		(STATIC_AUDIENCE_ROUTES as readonly string[]).includes(route) ||
		dynamicAudienceRoutes.some((pattern) => pattern.test(route))
	);
}

export function resolveAudienceRoute(params: URLSearchParams): string | null {
	const route = params.get('route')?.trim();
	if (!route) return null;
	if (
		route.length > 500 ||
		!route.startsWith('/') ||
		route.startsWith('//') ||
		/[\\?#\u0000-\u001f\u007f]/u.test(route) ||
		!isAudiencePageRoute(route)
	)
		return null;
	return route;
}

const DAY_MS = 86_400_000;
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Africa/Kigali',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});

function shiftDay(date: string, days: number): string {
	return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function validDate(value: string | null): value is string {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function resolveAudiencePeriod(
	params: URLSearchParams,
	now: Date = new Date()
): AudiencePeriod {
	const today = dateFormatter.format(now);
	const requested = params.get('days') ?? '30';
	if (requested in RECENT_RANGES) {
		const key = requested as RecentRange;
		const { minutes, bucketMinutes } = RECENT_RANGES[key];
		return {
			key,
			from: today,
			through: today,
			recentMinutes: minutes,
			bucketMinutes,
			bucketCount: minutes / bucketMinutes
		};
	}

	let key: AudienceRange = '30';
	let from = shiftDay(today, -29);
	let through = today;
	const yesterday = shiftDay(today, -1);
	const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
	const thisMonday = shiftDay(today, -weekday);
	const firstOfMonth = `${today.slice(0, 7)}-01`;

	switch (requested) {
		case '7':
		case '30':
		case '90':
			key = requested;
			from = shiftDay(today, 1 - Number(requested));
			break;
		case 'today':
			key = requested;
			from = today;
			break;
		case 'yesterday':
			key = requested;
			from = yesterday;
			through = yesterday;
			break;
		case 'week_to_date':
			key = requested;
			from = thisMonday;
			break;
		case 'previous_week':
			key = requested;
			from = shiftDay(thisMonday, -7);
			through = shiftDay(thisMonday, -1);
			break;
		case 'month_to_date':
			key = requested;
			from = firstOfMonth;
			break;
		case 'previous_month':
			key = requested;
			from = shiftDay(firstOfMonth, -1).slice(0, 7) + '-01';
			through = shiftDay(firstOfMonth, -1);
			break;
		case 'year_to_date':
			key = requested;
			from = `${today.slice(0, 4)}-01-01`;
			break;
		case 'previous_year': {
			key = requested;
			const year = Number(today.slice(0, 4)) - 1;
			from = `${year}-01-01`;
			through = `${year}-12-31`;
			break;
		}
		case 'custom': {
			const selectedFrom = params.get('from');
			const selectedThrough = params.get('through');
			if (
				validDate(selectedFrom) &&
				validDate(selectedThrough) &&
				selectedFrom <= selectedThrough &&
				selectedThrough <= today &&
				(Date.parse(selectedThrough) - Date.parse(selectedFrom)) / DAY_MS < 366
			) {
				key = requested;
				from = selectedFrom;
				through = selectedThrough;
			}
			break;
		}
	}

	return { key, from, through, recentMinutes: null, bucketMinutes: 0, bucketCount: 0 };
}
