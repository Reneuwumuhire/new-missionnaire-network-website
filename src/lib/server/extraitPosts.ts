import archive from '$lib/data/channelPosts.json';
import { getDb } from '../../db/mongo';

export async function getExtraitFeed() {
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

	return {
		...archive,
		posts: [...managedPosts, ...archive.posts]
			.filter(
				(post, index, all) => all.findIndex((candidate) => candidate.id === post.id) === index
			)
			.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
	};
}
