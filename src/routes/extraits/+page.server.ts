import archive from '$lib/data/channelPosts.json';
import { pageMeta } from '$lib/seo';
import { getDb } from '../../db/mongo';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	let managedPosts: Array<Record<string, any>> = [];
	try {
		const db = await getDb();
		const rows = await db
			.collection('extrait_posts')
			.find({ status: 'published' })
			.sort({ publishedAt: -1 })
			.limit(100)
			.toArray();
		managedPosts = rows.map((post) => ({
			id: post._id.toString(),
			publishedAt: new Date(post.publishedAt).toISOString(),
			text: post.text,
			excerpt: post.excerpt,
			bodyHtml: post.bodyHtml,
			image: post.image,
			imageWidth: post.imageWidth,
			imageHeight: post.imageHeight,
			sourceTitle: post.sourceTitle,
			links: post.links
		}));
	} catch (cause) {
		console.error('[Extraits] Managed posts unavailable:', cause);
	}

	const posts = [...managedPosts, ...archive.posts]
		.filter((post, index, all) => all.findIndex((candidate) => candidate.id === post.id) === index)
		.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

	return {
		...archive,
		posts,
		meta: pageMeta('/extraits', {
			title: 'Extraits des prédications | Missionnaire Network',
			description:
				'Retrouvez les extraits publiés sur notre canal, avec leurs images et les liens vers les prédications, retransmissions, vidéos et PDF.'
		})
	};
};
