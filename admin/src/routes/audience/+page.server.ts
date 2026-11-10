import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { getAudienceData, type AudienceRange } from '../../lib/server/audience';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	if (locals.user?.role !== 'superadmin') throw error(403, 'Accès réservé au super administrateur');
	depends('app:audience');
	const requested = url.searchParams.get('days');
	const numericDays = Number(requested);
	const days: AudienceRange =
		requested === '5m' ? '5m' : numericDays === 7 || numericDays === 90 ? numericDays : 30;
	const audience = await getAudienceData(days);
	return { days, audience, updatedAt: new Date().toISOString(), isPreview: dev && days === '5m' };
};
