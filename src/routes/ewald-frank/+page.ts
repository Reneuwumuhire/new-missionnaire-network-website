import type { PageLoad } from './$types';
import { SITE_URL, pageMeta } from '$lib/seo';

// Rendered by the root layout as the single og:*/twitter:* tag set.
// The 1280px hero variant (92 KB) stays under WhatsApp's og:image size
// limit; real dimensions are declared so crawlers render the card
// without a second fetch.
export const load: PageLoad = () => ({
	meta: pageMeta('/ewald-frank', {
		title: 'Ewald Frank - Missionnaire Network',
		description:
			'Biographie et enseignements d’Ewald Frank : parcours du ministère, citations et ressources du Message.',
		image: `${SITE_URL}/img/ewald_frank_page_header-1280.jpg`,
		imageWidth: 1280,
		imageHeight: 816,
		type: 'profile'
	})
});
