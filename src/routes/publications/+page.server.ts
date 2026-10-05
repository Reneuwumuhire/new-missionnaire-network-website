import { pageMeta, shareDescription, shareTitle, SITE_URL } from '$lib/seo';
import { getExtraitFeed } from '$lib/server/extraitPosts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const feed = await getExtraitFeed();
	const post = feed.posts.find((candidate) => candidate.id === url.searchParams.get('post'));
	const image = post?.image ? new URL(post.image, url.origin) : null;
	const shareImage = image?.hostname.endsWith('.amazonaws.com')
		? `${url.origin}/_vercel/image?url=${encodeURIComponent(image.toString())}&w=1080&q=50`
		: image?.toString();

	return {
		...feed,
		selectedPostId: post?.id ?? null,
		meta: post
			? pageMeta(`/publications?post=${encodeURIComponent(post.id)}`, {
					title: shareTitle(post.sourceTitle, ' · Publication'),
					description: shareDescription(post.excerpt || post.text),
					image: shareImage,
					type: 'article'
				})
			: pageMeta('/publications', {
					title: 'TRANSCRIPTION DES PRÉDICATIONS | Missionnaire Network',
					description:
						'Cette chaîne publiera principalement les extraits des transcriptions des prédications de Frère William Marrion BRANHAM et les extraits des prédications de Frère Ewald Frank en français. QUE DIEU VOUS BÉNISSE !',
					image: `${SITE_URL}/img/whatsapp-channel.jpg`,
					imageWidth: 640,
					imageHeight: 640
				})
	};
};
