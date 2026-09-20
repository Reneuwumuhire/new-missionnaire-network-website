import { pageMeta } from '$lib/seo';

export const load = () => ({
	meta: pageMeta('/privacy', {
		title: 'Privacy policy \u2014 Missionnaire Studio',
		description:
			'How Missionnaire Studio and Admin access, use, store and delete Google and YouTube data.'
	})
});
