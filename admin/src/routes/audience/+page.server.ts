import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { getAudienceData, getAudienceRouteOptions } from '../../lib/server/audience';
import { resolveAudiencePeriod, resolveAudienceRoute } from '../../lib/server/audience-period';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	if (locals.user?.role !== 'superadmin') throw error(403, 'Accès réservé au super administrateur');
	depends('app:audience');
	const period = resolveAudiencePeriod(url.searchParams);
	const route = resolveAudienceRoute(url.searchParams);
	const [audience, routeOptions] = await Promise.all([
		getAudienceData(period, route),
		getAudienceRouteOptions(period)
	]);
	return {
		period,
		route,
		routeOptions:
			route && ![...routeOptions.main, ...routeOptions.visited].includes(route)
				? { ...routeOptions, visited: [route, ...routeOptions.visited] }
				: routeOptions,
		audience,
		updatedAt: new Date().toISOString(),
		isPreview: dev && period.recentMinutes !== null,
		publicSiteBase: dev
			? 'http://localhost:5174'
			: process.env.MAIN_SITE_URL || 'https://missionnaire.net'
	};
};
