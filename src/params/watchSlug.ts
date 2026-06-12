import type { ParamMatcher } from '@sveltejs/kit';

// Watch-link slugs are 11-char base64url ids (see admin createScheduledLive).
// The 8-16 range gives headroom; anything else under /live/* falls through to
// a 404 instead of hitting the DB. Static segments (/live/rediffusions) always
// outrank this param route in SvelteKit's routing, so no collision there.
export const match: ParamMatcher = (param) => /^[A-Za-z0-9_-]{8,16}$/.test(param);
