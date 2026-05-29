import { getRecentPublished } from '$lib/server/recordings';
import { getBroadcastAdminState, getRadioCachedStatus } from '../../db/collections';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders, url }) => {
	// Edge-cache the rendered page, but keep the freshness window short so a
	// newly published rediffusion appears in "Directs précédents" within ~a
	// minute rather than a day. The live banner + radio player are hydrated
	// client-side (LiveRadioPlayer fetches /api/live/radio-state then streams
	// SSE updates), so the only server-rendered data here is the recordings
	// list. With s-maxage=60 the edge serves a cached copy for a minute, then
	// `stale-while-revalidate` keeps every later hit instant — the edge returns
	// the stale copy immediately and refreshes it in the background, so a fresh
	// recording propagates on the next request instead of blocking on the DB.
	setHeaders({
		'cache-control': 'public, s-maxage=60, stale-while-revalidate=600'
	});

	const [recentRecordings, adminGate, status] = await Promise.all([
		getRecentPublished(5),
		getBroadcastAdminState(),
		getRadioCachedStatus()
	]);

	// "Live" exactly as /api/live/radio-state computes it: the admin gate must
	// be on AND Icecast must actually be serving audio. Mirroring it keeps the
	// share preview consistent with what the player shows — no "live" card when
	// the audio isn't really flowing.
	const isLive = (status?.isLive ?? false) && adminGate.is_live;

	// Server-rendered Open Graph / Twitter data so link-preview crawlers
	// (WhatsApp, Facebook, iMessage…) show the current live title + thumbnail
	// when someone shares the /live link. Crawlers don't run JS, hence why
	// this can't live only in the client-hydrated player. The title/thumbnail
	// come from the same stream source the player uses — `broadcast_admin_state`
	// (via radio-state). Falls back to the generic page metadata when nothing is
	// on air. Resolve the thumbnail to an absolute URL — relative paths break
	// OG image previews.
	const rawThumb = isLive ? adminGate.thumbnail_url : null;
	const ogImage = rawThumb
		? rawThumb.startsWith('http')
			? rawThumb
			: new URL(rawThumb, url.origin).toString()
		: null;

	// Route the thumbnail through Vercel Image Optimization. The raw S3 PNGs are
	// ~700 KB, and WhatsApp silently drops any og:image over ~300 KB (so no
	// preview thumbnail). `w=1080` is an allowed size in svelte.config's
	// images.sizes (1200 is NOT — it 400s), and a low quality keeps the result
	// well under the limit (~185 KB observed). For crawler Accept headers Vercel
	// returns the original format (PNG), not webp/avif, so previews stay
	// compatible. Built on `url.origin` so it points at the served, non-
	// redirecting host. We deliberately don't pass image dimensions to `meta`:
	// the optimizer preserves the source aspect ratio, which varies per upload,
	// so the layout omits og:image:width/height and lets crawlers read the real
	// size instead of mis-declaring 1200×630.
	const ogImageOptimized = ogImage
		? `${url.origin}/_vercel/image?url=${encodeURIComponent(ogImage)}&w=1080&q=50`
		: null;

	const liveTitle = isLive ? adminGate.title : null;
	const DEFAULT_TITLE = 'Audio en direct - Missionnaire Network';
	const DEFAULT_DESC =
		'Écoutez Missionnaire Network en direct audio. Prédications et cantiques du Message de l’Heure en streaming continu.';

	return {
		recentRecordings,
		liveMeta: {
			isLive,
			title: liveTitle,
			description: isLive ? adminGate.description : null,
			thumbnailUrl: ogImage
		},
		// Single source of truth for og:*/twitter:* — the root +layout.svelte
		// renders one canonical set from `meta`. The page must NOT emit its own
		// og:* tags or crawlers see duplicates and pick the layout default image
		// (og-image.jpg) over the live thumbnail. Only set `image` when live so
		// the layout falls back to the site default off-air.
		meta: {
			title: liveTitle ? `🔴 En direct : ${liveTitle}` : DEFAULT_TITLE,
			description: (isLive && adminGate.description) || DEFAULT_DESC,
			url: 'https://missionnaire.net/live',
			...(ogImageOptimized ? { image: ogImageOptimized } : {})
		}
	};
};
