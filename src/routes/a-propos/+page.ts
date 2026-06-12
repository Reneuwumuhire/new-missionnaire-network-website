import type { PageLoad } from './$types';
import { pageMeta } from '$lib/seo';

// Rendered by the root layout as the single og:*/twitter:* tag set.
export const load: PageLoad = () => ({
	meta: pageMeta('/a-propos', {
		title: 'À propos - Missionnaire Network',
		description:
			'Découvrez la mission de Missionnaire Network, qui nous sommes et comment nous contacter pour suivre l’œuvre.'
	})
});
