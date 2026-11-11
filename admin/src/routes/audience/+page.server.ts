import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { getAudienceData } from '../../lib/server/audience';
import { resolveAudiencePeriod } from '../../lib/server/audience-period';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	if (locals.user?.role !== 'superadmin') throw error(403, 'Accès réservé au super administrateur');
	depends('app:audience');
	const period = resolveAudiencePeriod(url.searchParams);
	const audience = await getAudienceData(period);
	return {
		period,
		audience,
		updatedAt: new Date().toISOString(),
		isPreview: dev && period.recentMinutes !== null,
		publicSiteBase: dev
			? 'http://localhost:5174'
			: process.env.MAIN_SITE_URL || 'https://missionnaire.net'
	};
};
