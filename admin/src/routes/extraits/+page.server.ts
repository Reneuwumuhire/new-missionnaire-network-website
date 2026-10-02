import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import type { PageServerLoad } from './$types';
import { getDb } from '../../db/mongo';
import { getPermissions } from '$lib/models/admin-user';
import { getS3Url } from '$lib/server/s3';
import { whatsappExcerpt, whatsappToHtml } from '$lib/whatsapp-format';

const linkFields = [
	['sermonUrl', 'Voir la prédication', 'sermon'],
	['liveUrl', 'Écouter la retransmission', 'live'],
	['videoUrl', 'Voir la vidéo', 'video'],
	['pdfUrl', 'Lire le PDF', 'pdf'],
	['audioUrl', 'Écouter l’audio', 'audio'],
	['transcriptionUrl', 'Lire la transcription', 'transcription']
] as const;

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
		publishedAt: localDateTime(new Date(post.publishedAt)),
		imageUrl: post.image,
		imageKey: post.imageKey,
		imageWidth: post.imageWidth,
		imageHeight: post.imageHeight,
		links: post.links,
		updatedAt: new Date(post.updatedAt).toISOString()
	};
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const permissions = getPermissions(locals.user);
	if (!permissions.can_add && !permissions.can_edit) throw error(403, 'Accès refusé');

	const db = await getDb();
	const requestedId = url.searchParams.get('edit');
	const edit =
		requestedId && ObjectId.isValid(requestedId)
			? await db.collection('extrait_posts').findOne({ _id: new ObjectId(requestedId) })
			: null;
	const recent = await db
		.collection('extrait_posts')
		.find({})
		.sort({ updatedAt: -1 })
		.limit(12)
		.toArray();

	return {
		edit: edit ? serialize(edit) : null,
		recent: recent.map(serialize),
		defaultPublishedAt: localDateTime(),
		saved: url.searchParams.get('saved')
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const permissions = getPermissions(locals.user);
		if (!permissions.can_add && !permissions.can_edit) throw error(403, 'Accès refusé');

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

		const imageKey = values.imageKey;
		const image = values.imageUrl;
		const validImage =
			imageKey.startsWith('broadcast-thumbnails/extraits/') && image === getS3Url(imageKey);
		if (image && !validImage) return fail(400, { error: 'L’image envoyée est invalide.', values });
		if (intent === 'published' && !validImage) {
			return fail(400, { error: 'Ajoutez une image avant de publier.', values });
		}

		const width = Number.parseInt(values.imageWidth, 10);
		const height = Number.parseInt(values.imageHeight, 10);
		const now = new Date();
		const document = {
			status: intent,
			publishedAt,
			text: body.trim(),
			excerpt: whatsappExcerpt(body),
			bodyHtml: whatsappToHtml(body),
			image: validImage ? image : '',
			imageKey: validImage ? imageKey : '',
			imageWidth: Number.isFinite(width) && width > 0 ? width : 1200,
			imageHeight: Number.isFinite(height) && height > 0 ? height : 675,
			sourceTitle,
			links,
			updatedAt: now,
			updatedBy: locals.user.email
		};

		const db = await getDb();
		let id = values.postId;
		if (id) {
			if (!ObjectId.isValid(id) || !permissions.can_edit) throw error(403, 'Accès refusé');
			const result = await db
				.collection('extrait_posts')
				.updateOne({ _id: new ObjectId(id) }, { $set: document });
			if (!result.matchedCount) throw error(404, 'Extrait introuvable');
		} else {
			if (!permissions.can_add) throw error(403, 'Accès refusé');
			const result = await db.collection('extrait_posts').insertOne({
				...document,
				createdAt: now,
				createdBy: locals.user.email
			});
			id = result.insertedId.toString();
		}

		throw redirect(303, `/extraits?edit=${id}&saved=${intent}`);
	}
};
