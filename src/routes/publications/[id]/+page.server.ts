import { error } from '@sveltejs/kit';
import { getExtraitFeed } from '$lib/server/extraitPosts';
import { pageMeta, shareDescription, shareTitle } from '$lib/seo';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const feed = await getExtraitFeed();
	const post = feed.posts.find((candidate) => candidate.id === params.id);
	if (!post) error(404, 'Publication introuvable');
	const image = new URL(post.image, url.origin);
	const shareImage = image.hostname.endsWith('.amazonaws.com')
		? `${url.origin}/_vercel/image?url=${encodeURIComponent(image.toString())}&w=1080&q=50`
		: image.toString();

	return {
		...feed,
		posts: [post],
		meta: pageMeta(`/publications/${encodeURIComponent(post.id)}`, {
			title: shareTitle(post.sourceTitle, ' · Publication'),
			description: shareDescription(post.excerpt || post.text),
			image: shareImage,
			type: 'article'
		})
	};
};
