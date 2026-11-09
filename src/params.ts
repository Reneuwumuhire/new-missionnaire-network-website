import { defineParams } from '@sveltejs/kit/params';

// SvelteKit 3 uses one params module; the per-matcher file in src/params is
// retained temporarily so builds on the earlier SvelteKit 2 branch still work.
export const params = defineParams({
	watchSlug: (param) => (/^[A-Za-z0-9_-]{8,16}$/.test(param) ? param : undefined)
});
