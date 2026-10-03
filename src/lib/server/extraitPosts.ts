import archive from '$lib/data/channelPosts.json';
import { getDb } from '../../db/mongo';

type PublicationPost = {
	id: string;
	publishedAt: string;
	text: string;
	excerpt: string;
	bodyHtml: string;
	image: string;
	imageWidth: number;
	imageHeight: number;
	sourceTitle: string;
	links: Array<{ label: string; href: string; kind: string }>;
};

function decodeHtmlEntities(value: string): string {
	return value.replace(/&(?:#(\d+)|#x([\da-f]+)|amp|lt|gt|quot|apos);/gi, (entity, dec, hex) => {
		if (dec) return String.fromCodePoint(Number(dec));
		if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
		return (
			{
				'&amp;': '&',
				'&lt;': '<',
				'&gt;': '>',
				'&quot;': '"',
				'&apos;': "'"
			}[entity.toLowerCase()] ?? entity
		);
	});
}

export function whatsappTextFromHtml(value: string): string {
	return decodeHtmlEntities(
		value
			.replace(/<br\s*\/?\s*>/gi, '\n')
			.replace(/<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>/gi, '*$1*')
			.replace(/<(?:em|i)>([\s\S]*?)<\/(?:em|i)>/gi, '_$1_')
			.replace(/<(?:del|s)>([\s\S]*?)<\/(?:del|s)>/gi, '~$1~')
			.replace(/<code>([\s\S]*?)<\/code>/gi, (_, content: string) =>
				content.includes('\n') ? `\`\`\`${content}\`\`\`` : `\`${content}\``
			)
			.replace(/<blockquote>([\s\S]*?)<\/blockquote>/gi, (_, content: string) =>
				content
					.split('\n')
					.map((line) => `> ${line}`)
					.join('\n')
			)
			.replace(/<[^>]+>/g, '')
	)
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

export async function getExtraitFeed() {
	let managedPosts: PublicationPost[] = [];
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

	const posts = [...managedPosts, ...(archive.posts as PublicationPost[])]
		.filter((post, index, all) => all.findIndex((candidate) => candidate.id === post.id) === index)
		.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
		.map((post) => ({
			...post,
			shareText: whatsappTextFromHtml(post.bodyHtml) || post.text
		}));

	return {
		...archive,
		posts
	};
}
