import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';
import { getDb } from '../../db/mongo';
import { getPermissions } from '$lib/models/admin-user';
import { deleteObject, getS3Url } from '$lib/server/s3';
import { whatsappExcerpt, whatsappToHtml } from '$lib/whatsapp-format';

const linkFields = [
	['sermonUrl', 'Voir la prédication', 'sermon'],
	['liveUrl', 'Écouter la retransmission', 'live'],
	['videoUrl', 'Voir la vidéo', 'video'],
	['pdfUrl', 'Lire le PDF', 'pdf'],
	['audioUrl', 'Écouter l’audio', 'audio'],
	['transcriptionUrl', 'Lire la transcription', 'transcription']
] as const;

type ArchivedPost = {
	id: string;
	publishedAt: string;
	sourceTitle: string;
	excerpt: string;
	text: string;
	bodyHtml: string;
	image: string;
	imageWidth: number;
	imageHeight: number;
	links: { label: string; href: string; kind: string }[];
	source?: { kind: string; id: string } | null;
};
type ExtraitRecord = { _id: ObjectId | string; [key: string]: any };

async function fetchArchive(fetch: typeof globalThis.fetch): Promise<ArchivedPost[] | null> {
	try {
		const response = await fetch(
			`${(env.MAIN_SITE_URL || 'https://missionnaire.net').replace(/\/$/, '')}/api/publications/archive`,
			{ signal: AbortSignal.timeout(5000) }
		);
		if (!response.ok) throw new Error(`Archive returned ${response.status}`);
		const payload = await response.json();
		if (!Array.isArray(payload.posts)) throw new Error('Invalid archive response');
		return payload.posts.filter(
			(post: unknown): post is ArchivedPost =>
				typeof post === 'object' &&
				post !== null &&
				typeof (post as ArchivedPost).id === 'string' &&
				typeof (post as ArchivedPost).publishedAt === 'string' &&
				typeof (post as ArchivedPost).sourceTitle === 'string' &&
				typeof (post as ArchivedPost).excerpt === 'string' &&
				typeof (post as ArchivedPost).text === 'string' &&
				typeof (post as ArchivedPost).bodyHtml === 'string' &&
				typeof (post as ArchivedPost).image === 'string' &&
				Array.isArray((post as ArchivedPost).links) &&
				Number.isFinite(Date.parse((post as ArchivedPost).publishedAt))
		);
	} catch (cause) {
		console.error('[Publications] Archive unavailable:', cause);
		return null;
	}
}

function localDateTime(value = new Date()): string {
	return new Date(value.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function formValues(formData: FormData) {
	return Object.fromEntries(
		[
			'sourceTitle',
			'body',
			'publishedAt',
			'imageUrl',
			'imageKey',
			'imageWidth',
			'imageHeight',
			'postId',
			'sourceKind',
			'sourceId',
			...linkFields.map(([field]) => field)
		].map((field) => [field, formData.get(field)?.toString().trim() ?? ''])
	);
}

function validLink(value: string): boolean {
	if (!value) return true;
	if (value.startsWith('/') && !value.startsWith('//')) return true;
	try {
		return ['http:', 'https:'].includes(new URL(value).protocol);
	} catch {
		return false;
	}
}

function serialize(post: Record<string, any>) {
	return {
		id: post._id.toString(),
		status: post.status,
		sourceTitle: post.sourceTitle,
		body: post.text,
		bodyHtml: post.bodyHtml,
		publishedAt: localDateTime(new Date(post.publishedAt)),
		imageUrl: post.image,
		imageKey: post.imageKey,
		imageWidth: post.imageWidth,
		imageHeight: post.imageHeight,
		links: post.links,
		sourceKind: post.source?.kind ?? '',
		sourceId: post.source?.id ?? '',
		updatedAt: new Date(post.updatedAt).toISOString(),
		createdAt: new Date(post.createdAt ?? post.updatedAt).toISOString(),
		createdBy: post.createdBy ?? null,
		updatedBy: post.updatedBy ?? null,
		channelSharedAt: post.channelSharedAt ? new Date(post.channelSharedAt).toISOString() : null
	};
}

function serializeArchive(post: ArchivedPost) {
	return {
		id: post.id,
		status: 'published',
		sourceTitle: post.sourceTitle,
		body: post.text,
		bodyHtml: post.bodyHtml,
		publishedAt: localDateTime(new Date(post.publishedAt)),
		imageUrl: post.image,
		imageKey: '',
		imageWidth: post.imageWidth,
		imageHeight: post.imageHeight,
		links: post.links,
		sourceKind: post.source?.kind ?? '',
		sourceId: post.source?.id ?? '',
		updatedAt: post.publishedAt,
		createdAt: post.publishedAt,
		createdBy: null,
		updatedBy: null,
		channelSharedAt: null
	};
}

export const load: PageServerLoad = async ({ locals, url, fetch }) => {
	const permissions = getPermissions(locals.user);
	if (!permissions.can_manage_extraits) throw error(403, 'Accès refusé');
	const archivedRequest = fetchArchive(fetch);

	const db = await getDb();
	const posts = db.collection<ExtraitRecord>('extrait_posts');
	const requestedId = url.searchParams.get('edit');
	const edit =
		requestedId && ObjectId.isValid(requestedId)
			? await posts.findOne({ _id: new ObjectId(requestedId) })
			: requestedId
				? await posts.findOne({ _id: requestedId })
				: null;
	const recent = await posts
		.find({ _id: { $type: 'objectId' } })
		.sort({ createdAt: -1 })
		.limit(12)
		.toArray();
	const archived = await archivedRequest;
	const overlays = archived?.length
		? await posts.find({ _id: { $in: archived.map(({ id }) => id) } }).toArray()
		: [];
	const byId = new Map(overlays.map((post) => [post._id.toString(), post]));
	const archivedEdit = archived?.find(({ id }) => id === requestedId);

	return {
		edit: edit ? serialize(edit) : archivedEdit ? serializeArchive(archivedEdit) : null,
		recent: recent.map(serialize),
		archived: (archived ?? []).map((post) => {
			const overlay = byId.get(post.id);
			return {
				id: post.id,
				publishedAt: overlay ? new Date(overlay.publishedAt).toISOString() : post.publishedAt,
				sourceTitle: overlay?.sourceTitle ?? post.sourceTitle,
				excerpt: overlay?.excerpt ?? post.excerpt,
				image: overlay?.image ?? post.image,
				status: overlay?.status ?? 'published',
				updatedAt: overlay?.updatedAt ? new Date(overlay.updatedAt).toISOString() : null,
				updatedBy: overlay?.updatedBy ?? null
			};
		}),
		archiveUnavailable: archived === null,
		defaultPublishedAt: localDateTime(),
		saved: url.searchParams.get('saved'),
		managed: url.searchParams.get('managed')
	};
};

export const actions: Actions = {
	save: async ({ request, locals, fetch }) => {
		const permissions = getPermissions(locals.user);
		if (!permissions.can_manage_extraits) throw error(403, 'Accès refusé');

		const formData = await request.formData();
		const values = formValues(formData);
		const intent = formData.get('intent') === 'publish' ? 'published' : 'draft';
		const sourceTitle = values.sourceTitle;
		const body = values.body;
		if (!sourceTitle || sourceTitle.length > 180) {
			return fail(400, { error: 'Ajoutez un titre de source (180 caractères maximum).', values });
		}
		if (!body || body.length > 50_000) {
			return fail(400, { error: 'Ajoutez le texte de l’extrait.', values });
		}

		const publishedAt = new Date(`${values.publishedAt}:00+02:00`);
		if (
			!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(values.publishedAt) ||
			Number.isNaN(publishedAt.getTime())
		) {
			return fail(400, { error: 'La date de publication est invalide.', values });
		}

		const links = [];
		for (const [field, label, kind] of linkFields) {
			const href = values[field];
			if (!validLink(href))
				return fail(400, { error: `Le lien « ${label} » est invalide.`, values });
			if (href) links.push({ label, href, kind });
		}
		const db = await getDb();
		const posts = db.collection<ExtraitRecord>('extrait_posts');
		let id = values.postId;
		const archivePost =
			id && !ObjectId.isValid(id)
				? (await fetchArchive(fetch))?.find((post) => post.id === id)
				: null;
		if (id && !ObjectId.isValid(id) && !archivePost)
			throw error(404, 'Ancienne publication introuvable');
		const postId = id ? (ObjectId.isValid(id) ? new ObjectId(id) : id) : null;
		const previous = postId ? await posts.findOne({ _id: postId }) : null;
		if (postId instanceof ObjectId && !previous) throw error(404, 'Extrait introuvable');
		const original = previous ?? archivePost;
		if (original?.links) {
			links.push(
				...original.links.filter(
					(link: { kind: string }) => !linkFields.some(([, , kind]) => kind === link.kind)
				)
			);
		}

		const imageKey = values.imageKey;
		const image = values.imageUrl;
		const validUploadedImage =
			imageKey.startsWith('broadcast-thumbnails/extraits/') && image === getS3Url(imageKey);
		const validArchiveImage = !!archivePost?.image && !imageKey && image === archivePost.image;
		const validImage = validUploadedImage || validArchiveImage;
		if (image && !validImage) return fail(400, { error: 'L’image envoyée est invalide.', values });
		if (intent === 'published' && !validImage) {
			return fail(400, { error: 'Ajoutez une image avant de publier.', values });
		}

		const width = Number.parseInt(values.imageWidth, 10);
		const height = Number.parseInt(values.imageHeight, 10);
		const validSource =
			['recording', 'sermon'].includes(values.sourceKind) && /^[a-f\d]{24}$/i.test(values.sourceId);
		if ((values.sourceKind || values.sourceId) && !validSource) {
			return fail(400, { error: 'La source sélectionnée est invalide.', values });
		}
		const now = new Date();
		const document = {
			status: intent,
			publishedAt,
			text: body.trim(),
			excerpt: whatsappExcerpt(body),
			bodyHtml: original?.text === body.trim() ? original.bodyHtml : whatsappToHtml(body),
			image: validImage ? image : '',
			imageKey: validUploadedImage ? imageKey : '',
			imageWidth: Number.isFinite(width) && width > 0 ? width : 1200,
			imageHeight: Number.isFinite(height) && height > 0 ? height : 675,
			sourceTitle,
			source: validSource ? { kind: values.sourceKind, id: values.sourceId } : null,
			links,
			updatedAt: now,
			updatedBy: locals.user.email
		};

		if (postId) {
			if (previous) {
				const result = await posts.updateOne(
					{ _id: postId },
					previous.text !== document.text || previous.image !== document.image
						? { $set: document, $unset: { channelSharedAt: '' } }
						: { $set: document }
				);
				if (!result.matchedCount) throw error(404, 'Extrait introuvable');
			} else {
				await posts.insertOne({
					_id: postId,
					...document,
					createdAt: now,
					createdBy: null
				});
			}
		} else {
			const result = await posts.insertOne({
				_id: new ObjectId(),
				...document,
				createdAt: now,
				createdBy: locals.user.email
			});
			id = result.insertedId.toString();
		}

		throw redirect(303, `/publications?edit=${id}&saved=${intent}`);
	},
	share: async ({ request, locals }) => {
		if (!getPermissions(locals.user).can_manage_extraits) throw error(403, 'Accès refusé');
		const formData = await request.formData();
		const undo = formData.has('undo');
		const id = formData.get(undo ? 'undo' : 'targetId')?.toString() ?? '';
		if (!ObjectId.isValid(id)) throw error(400, 'Publication invalide');

		const result = await (
			await getDb()
		)
			.collection('extrait_posts')
			.updateOne(
				undo
					? { _id: new ObjectId(id), channelSharedAt: { $exists: true } }
					: { _id: new ObjectId(id), status: 'published', channelSharedAt: { $exists: false } },
				undo ? { $unset: { channelSharedAt: '' } } : { $set: { channelSharedAt: new Date() } }
			);
		if (!result.matchedCount) throw error(409, 'État de partage modifié entre-temps');
		throw redirect(303, `/publications?managed=${undo ? 'unshared' : 'shared'}`);
	},
	toggle: async ({ request, locals }) => {
		const permissions = getPermissions(locals.user);
		if (!permissions.can_manage_extraits) throw error(403, 'Accès refusé');

		const id = (await request.formData()).get('targetId')?.toString() ?? '';
		if (!ObjectId.isValid(id)) throw error(400, 'Extrait invalide');

		const db = await getDb();
		const post = await db.collection('extrait_posts').findOne({ _id: new ObjectId(id) });
		if (!post) throw error(404, 'Extrait introuvable');

		const status = post.status === 'published' ? 'draft' : 'published';
		if (
			status === 'published' &&
			(!post.imageKey?.startsWith('broadcast-thumbnails/extraits/') ||
				post.image !== getS3Url(post.imageKey))
		) {
			return fail(400, { error: 'Ajoutez une image avant de publier cet extrait.' });
		}

		await db
			.collection('extrait_posts')
			.updateOne(
				{ _id: post._id },
				{ $set: { status, updatedAt: new Date(), updatedBy: locals.user.email } }
			);
		throw redirect(303, `/publications?managed=${status === 'published' ? 'published' : 'hidden'}`);
	},
	delete: async ({ request, locals }) => {
		const permissions = getPermissions(locals.user);
		if (!permissions.can_manage_extraits) throw error(403, 'Accès refusé');

		const id = (await request.formData()).get('targetId')?.toString() ?? '';
		if (!ObjectId.isValid(id)) throw error(400, 'Extrait invalide');

		const db = await getDb();
		const post = await db.collection('extrait_posts').findOneAndDelete({ _id: new ObjectId(id) });
		if (!post) throw error(404, 'Extrait introuvable');
		if (post.imageKey?.startsWith('broadcast-thumbnails/extraits/')) {
			try {
				await deleteObject(post.imageKey);
			} catch (cause) {
				console.error('[Extraits] Image cleanup failed:', cause);
			}
		}

		throw redirect(303, '/publications?managed=deleted');
	}
};
