import type { PageLoad } from './$types';
import { pageMeta } from '$lib/seo';

// Rendered by the root layout as the single og:*/twitter:* tag set.
// No page image: the local photos (eglise_header 551 KB / eglise_inside
// 433 KB) exceed WhatsApp's ~300 KB og:image limit, so the default
// 1200×630 og-image.jpg makes the better share card.
export const load: PageLoad = () => ({
	meta: pageMeta('/eglise', {
		title: 'Église Locale - Missionnaire Network',
		description:
			"Présentation de l'assemblée locale de Kigali/Gatenga/Murambi et de son engagement pour le Message de l'Heure."
	})
});
