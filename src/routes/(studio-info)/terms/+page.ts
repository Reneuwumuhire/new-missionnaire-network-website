import { pageMeta } from '$lib/seo';

export const load = () => ({
	meta: pageMeta('/terms', {
		title: 'Terms of service \u2014 Missionnaire Studio',
		description:
			'Terms for authorized use of Missionnaire Studio, Admin and connected YouTube services.'
	})
});
