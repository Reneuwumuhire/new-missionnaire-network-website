import type { PageLoad } from './$types';
import { SITE_URL, pageMeta } from '$lib/seo';

// Rendered by the root layout as the single og:*/twitter:* tag set.
// The page header portrait (85 KB, well under WhatsApp's og:image size
// limit) makes a recognisable share card; real dimensions are declared
// so crawlers render it without a second fetch.
export const load: PageLoad = () => ({
	meta: pageMeta('/william-branham/biographie', {
		title: 'William Branham - Missionnaire Network',
		description:
			'Biographie de William Marrion Branham : son ministère, citations et ressources du Message de l’Heure.',
		image: `${SITE_URL}/img/branham_page_header.jpg`,
		imageWidth: 1000,
		imageHeight: 460,
		type: 'profile'
	})
});
