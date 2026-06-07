import { redirect } from '@sveltejs/kit';
import { getPublishedNearSession, getRecentPublished } from '$lib/server/recordings';
import { getBroadcastAdminState, getRadioCachedStatus } from '../../db/collections';
import type { PageServerLoad } from './$types';

// ── Shared-live deep link → land on the exact rediffusion ───────────────────
// A live share link carries the broadcast session it was created in
// (`?live=<started_at-ms>`, see +shareLive.svelte). While that direct is still
// on air the recipient should just get /live (and hear the live). Once it has
// ended we forward them to the replay that came out of that session so they
// don't land on the generic off-air page. Matched by timestamp proximity
// because nothing links a broadcast to its recording (see
// getPublishedNearSession). Returns the replay path to redirect to, or null to
// render /live normally.
async function resolveSharedReplayPath(
	liveParam: string,
	isLive: boolean,
	broadcastStartedAt: string | null
): Promise<string | null> {
	const sessionMs = Number(liveParam);
	if (!Number.isFinite(sessionMs) || sessionMs <= 0) return null;
	const currentMs = broadcastStartedAt ? Date.parse(broadcastStartedAt) : Number.NaN;
	// Same session still on air? (allow a minute of skew) → render /live.
	const sameLiveSession =
		isLive && !Number.isNaN(currentMs) && Math.abs(currentMs - sessionMs) < 60_000;
	if (sameLiveSession) return null;
	const rec = await getPublishedNearSession(new Date(sessionMs).toISOString());
	return rec ? `/live/rediffusions/${rec.id}?autoplay=1` : null;
}

export const load: PageServerLoad = async ({ setHeaders, url }) => {
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

	const liveParam = url.searchParams.get('live');
	if (liveParam) {
		const replayPath = await resolveSharedReplayPath(liveParam, isLive, adminGate.started_at);
		// 307 (temporary) is essential: the SAME url must resume
		// redirecting/not-redirecting as the broadcast state changes, so it must
		// never be cached as a permanent redirect.
		if (replayPath) throw redirect(307, replayPath);
		// Param present but we're rendering (same live, or replay not published
		// yet): don't let this per-link variant pollute the shared edge cache.
		setHeaders({ 'cache-control': 'no-store' });
	} else {
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
	}

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

	// The current broadcast session, used by the share button to stamp the live
	// link (`/live?live=<session>`) so it later resolves to this exact replay.
	// Epoch-ms for a compact URL. Server-rendered as a fallback; the share
	// component refreshes it from /api/live/radio-state so it stays correct even
	// when this page is served from the short edge cache.
	const liveSessionId = isLive && adminGate.started_at ? Date.parse(adminGate.started_at) : null;

	return {
		recentRecordings,
		liveSessionId: liveSessionId && !Number.isNaN(liveSessionId) ? liveSessionId : null,
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
