import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => ({ channel: url.searchParams.get('channel') ?? 'YouTube' });
