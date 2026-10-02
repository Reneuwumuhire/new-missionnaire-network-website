import { error } from '@sveltejs/kit';
import { getExtraitFeed } from '$lib/server/extraitPosts';
import { pageMeta, shareDescription, shareTitle, SITE_URL } from '$lib/seo';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const feed = await getExtraitFeed();
	const post = feed.posts.find((candidate) => candidate.id === params.id);
	if (!post) error(404, 'Extrait introuvable');

	return {
		...feed,
		posts: [post],
		meta: pageMeta(`/extraits/${encodeURIComponent(post.id)}`, {
			title: shareTitle(post.sourceTitle, ' · Extrait'),
			description: shareDescription(post.excerpt || post.text),
			image: new URL(post.image, SITE_URL).toString(),
			imageWidth: post.imageWidth,
			imageHeight: post.imageHeight,
			type: 'article'
		})
	};
};
