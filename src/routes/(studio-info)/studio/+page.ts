import { pageMeta } from '$lib/seo';

export const load = () => ({
	meta: pageMeta('/studio', {
		title: 'Missionnaire Studio',
		description:
			'Create and manage live broadcasts with Missionnaire Studio and your authorized Missionnaire Admin account.'
	})
});
