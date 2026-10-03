import archive from '$lib/data/channelPosts.json';
import { publicAssetUrl } from '$lib/utils/librarySearch';
import { ObjectId } from 'mongodb';
import { getDb } from '../../db/mongo';
import {
	getPublicationEngagement,
	normalizePublicationEngagement,
	type PublicationEngagement
} from './publicationEngagement';
import { getTranscriptForRecording } from './recordings';

type PublicationLink = { label: string; href: string; kind: string };

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
	links: PublicationLink[];
	source?: { kind: 'recording' | 'sermon'; id: string } | null;
};

export function addMissingPdfLink(links: PublicationLink[], value: unknown): PublicationLink[] {
	if (links.some(({ kind }) => kind === 'pdf')) return links;
	const href = publicAssetUrl(value);
	return href ? [...links, { label: 'Lire le PDF', href, kind: 'pdf' }] : links;
}

export function recordingSourceFromLinks(
	links: PublicationLink[]
): PublicationPost['source'] | null {
	const href = links.find(({ kind }) => kind === 'live')?.href;
	if (!href) return null;
	try {
		const match = new URL(href, 'https://missionnaire.net').pathname.match(
			/^\/live\/rediffusions\/([a-f\d]{24})$/i
		);
		return match ? { kind: 'recording', id: match[1] } : null;
	} catch {
		return null;
	}
}

export function addMissingRecordingLinks(
	links: PublicationLink[],
	videoId: unknown,
	pdfUrl: unknown
): PublicationLink[] {
	let updated = links;
	if (typeof videoId === 'string' && videoId && !links.some(({ kind }) => kind === 'video')) {
		updated = [
			...updated,
			{ label: 'Voir la vidéo', href: `/videos?v=${encodeURIComponent(videoId)}`, kind: 'video' }
		];
	}
	updated = addMissingPdfLink(updated, pdfUrl);
	return updated.some(({ kind }) => kind === 'pdf')
		? updated.map((link) =>
				link.kind === 'live' && link.label === 'Écouter la retransmission'
					? { ...link, label: 'Écouter et lire la transcription' }
					: link
			)
		: updated;
}

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
	let archivedPosts: PublicationPost[] = (archive.posts as PublicationPost[]).map((post) => ({
		...post,
		source: post.source ?? recordingSourceFromLinks(post.links)
	}));
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
			links: post.links ?? [],
			source: post.source
		}));

		const linkedPosts = [...managedPosts, ...archivedPosts].filter(
			(post) =>
				post.source &&
				ObjectId.isValid(post.source.id) &&
				(!post.links.some(({ kind }) => kind === 'pdf') ||
					(post.source.kind === 'recording' && !post.links.some(({ kind }) => kind === 'video')))
		);
		const sourceIds = (kind: 'sermon' | 'recording') =>
			[
				...new Set(
					linkedPosts.filter(({ source }) => source?.kind === kind).map(({ source }) => source!.id)
				)
			].map((id) => new ObjectId(id));
		const sermonIds = sourceIds('sermon');
		const recordingIds = sourceIds('recording');
		const [sermons, recordings] = await Promise.all([
			sermonIds.length
				? db
						.collection('sermons')
						.find({ _id: { $in: sermonIds } }, { projection: { pdf_url: 1 } })
						.toArray()
				: [],
			recordingIds.length
				? db
						.collection('recordings')
						.find(
							{ _id: { $in: recordingIds } },
							{ projection: { transcript_pdf_id: 1, source_video_id: 1, started_at: 1 } }
						)
						.toArray()
				: []
		]);
		const resourcesBySource = new Map<string, { pdf?: unknown; videoId?: unknown }>(
			sermons.map((sermon) => [sermon._id.toString(), { pdf: sermon.pdf_url }])
		);
		await Promise.all(
			recordings.map(async (recording) => {
				const transcript = await getTranscriptForRecording({
					transcript_pdf_id: recording.transcript_pdf_id,
					source_video_id: recording.source_video_id ?? null,
					started_at: recording.started_at?.toISOString?.() ?? recording.started_at ?? null
				});
				resourcesBySource.set(recording._id.toString(), {
					pdf: transcript?.url,
					videoId: recording.source_video_id
				});
			})
		);
		const enrich = (post: PublicationPost): PublicationPost => {
			const resources = post.source && resourcesBySource.get(post.source.id);
			return {
				...post,
				links:
					post.source?.kind === 'recording'
						? addMissingRecordingLinks(post.links, resources?.videoId, resources?.pdf)
						: addMissingPdfLink(post.links, resources?.pdf)
			};
		};
		managedPosts = managedPosts.map(enrich);
		archivedPosts = archivedPosts.map(enrich);
	} catch (cause) {
		console.error('[Extraits] Managed posts unavailable:', cause);
	}

	const allPosts = [...managedPosts, ...archivedPosts];
	let engagementByPost = new Map<string, PublicationEngagement>();
	try {
		engagementByPost = await getPublicationEngagement([...new Set(allPosts.map(({ id }) => id))]);
	} catch (cause) {
		console.error('[Publications] Engagement unavailable:', cause);
	}

	const posts = allPosts
		.filter((post, index, all) => all.findIndex((candidate) => candidate.id === post.id) === index)
		.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
		.map((post) => {
			const publicPost = { ...post };
			delete publicPost.source;
			return {
				...publicPost,
				engagement: engagementByPost.get(post.id) ?? normalizePublicationEngagement(),
				shareText: whatsappTextFromHtml(post.bodyHtml) || post.text
			};
		});

	return {
		...archive,
		posts
	};
}
