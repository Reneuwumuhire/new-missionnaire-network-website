import { json } from '@sveltejs/kit';

// REMOVED. Live-status polling moved to push-driven updates:
// - /api/live/radio-state — pure state read (one-shot on page load)
// - /api/live/radio-listener — listener heartbeat (only while audio plays)
// - /api/cron/radio-probe — server-side Icecast probe (replaces user polls)
// - /api/internal/broadcast-event — admin → main-site push trigger
//
// This route is kept ONLY to neutralize stale clients that loaded the old
// JS bundle (and its 10s polling loop) before we deployed the push-driven
// architecture. We return 410 Gone with an aggressive `Cache-Control` so
// browsers cache the response for 24h: the stale tab's `setInterval` keeps
// firing, but the browser serves the cached 410 without ever reaching
// Vercel — instantly cutting their function-invocation cost from
// ~8,640 hits/day per stale user to ~1 hit/day per stale user.
//
// Stale clients will see a non-functional live banner until they reload —
// the Update Banner (`+updateBanner.svelte`) is the user-visible prompt for
// that. Once stale clients have drained (≥7 days post-deploy), this file
// can be deleted entirely.

const LONG_CACHE = 'public, max-age=86400, s-maxage=86400, immutable';

export async function GET({ setHeaders }) {
	setHeaders({ 'Cache-Control': LONG_CACHE });
	return json(
		{
			deprecated: true,
			message: 'Reload the page — this endpoint has been removed.'
		},
		{ status: 410 }
	);
}

export async function DELETE({ setHeaders }) {
	setHeaders({ 'Cache-Control': LONG_CACHE });
	return json({ deprecated: true }, { status: 410 });
}

// `navigator.sendBeacon` defaults to POST, so add a POST handler too — this
// catches any legacy disconnect beacons that were silently 405-ing before
// (which still consumed an invocation).
export async function POST({ setHeaders }) {
	setHeaders({ 'Cache-Control': LONG_CACHE });
	return json({ deprecated: true }, { status: 410 });
}
