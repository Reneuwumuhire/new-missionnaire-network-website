import { error, redirect } from '@sveltejs/kit';
import { getWatchState } from '$lib/server/scheduled-lives';
import type { PageServerLoad } from './$types';

const DEFAULT_DESC =
	'Écoutez Missionnaire Network en direct audio. Prédications et cantiques du Message de l’Heure en streaming continu.';

// The audience/broadcast schedule lives in Berlin/Zurich time — used only for
// the crawler-facing description; the on-page countdown renders in the
// viewer's local timezone client-side.
function formatScheduledAtFr(iso: string): string {
	try {
		return new Intl.DateTimeFormat('fr-FR', {
			timeZone: 'Europe/Zurich',
			dateStyle: 'full',
			timeStyle: 'short'
		}).format(new Date(iso));
	} catch {
		return iso;
	}
}

export const load: PageServerLoad = async ({ params, url, setHeaders }) => {
	const state = await getWatchState(params.slug);
	if (!state) throw error(404, 'Direct introuvable');
	const { live, phase, isLive, replayPath } = state;

	if (phase === 'ended' && replayPath) {
		// 307 (temporary) is essential: the SAME url must resume rendering the
		// waiting room / live player as state changes, so it must never be
		// cached as a permanent redirect.
		throw redirect(307, replayPath);
	}

	// Per-phase edge caching. The live → player transition is client-driven
	// (the page polls /api/live/watch/<slug>, which is no-store), so a ≤60s
	// stale first paint of the waiting room costs nothing — the poll corrects
	// it within seconds.
	if (phase === 'live') {
		setHeaders({ 'cache-control': 'no-store' });
	} else if (phase === 'ended_pending') {
		// Short window: the replay can be published at any moment, and the next
		// visit should turn into the 307 redirect quickly.
		setHeaders({ 'cache-control': 'public, s-maxage=30, stale-while-revalidate=120' });
	} else {
		setHeaders({ 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' });
	}

	// Server-rendered Open Graph data — same pipeline as /live: absolute URL,
	// then routed through Vercel Image Optimization (w=1080 is an allowed size,
	// 1200 is not; low quality keeps the og:image under WhatsApp's ~300 KB
	// silent-drop limit). The root +layout renders the single canonical set of
	// og:*/twitter:* tags from `meta` — the page must not emit its own.
	const rawThumb = live.thumbnail_url;
	const ogImage = rawThumb
		? rawThumb.startsWith('http')
			? rawThumb
			: new URL(rawThumb, url.origin).toString()
		: null;
	const ogImageOptimized = ogImage
		? `${url.origin}/_vercel/image?url=${encodeURIComponent(ogImage)}&w=1080&q=50`
		: null;

	const scheduledAtFr = formatScheduledAtFr(live.scheduled_at);
	let metaTitle: string;
	let metaDescription: string;
	if (phase === 'live') {
		metaTitle = `🔴 En direct : ${live.title}`;
		metaDescription = live.description || DEFAULT_DESC;
	} else if (phase === 'scheduled') {
		metaTitle = `Direct programmé : ${live.title}`;
		metaDescription = `Le ${scheduledAtFr} — ${live.description || 'sur Missionnaire Network.'}`;
	} else if (phase === 'cancelled') {
		metaTitle = `${live.title} — direct annulé`;
		metaDescription = DEFAULT_DESC;
	} else {
		metaTitle = `${live.title} — rediffusion bientôt disponible`;
		metaDescription = live.description || DEFAULT_DESC;
	}

	return {
		watch: {
			slug: live.slug,
			title: live.title,
			description: live.description,
			thumbnailUrl: live.thumbnail_url,
			scheduledAt: live.scheduled_at,
			phase,
			isLive
		},
		meta: {
			title: metaTitle,
			description: metaDescription,
			url: `https://missionnaire.net/live/${live.slug}`,
			...(ogImageOptimized ? { image: ogImageOptimized } : {})
		}
	};
};
