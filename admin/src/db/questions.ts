import { createHash } from 'node:crypto';
import { ObjectId, type Document, type Filter, type Sort } from 'mongodb';
import { getDb } from './mongo';
import { canAnswerQuestions } from '$lib/models/admin-user';
import type { AdminUser } from '$lib/models/admin-user';
import type {
	ModerationAction,
	Question,
	QuestionReference,
	QuestionReferenceType,
	QuestionReply,
	QuestionReport,
	QuestionStatus,
	ReferenceOption
} from '$lib/models/questions';

let indexesReady: Promise<void> | null = null;

function serializeDocument<T = unknown>(doc: unknown): T {
	if (doc == null) return doc as T;
	if (doc instanceof ObjectId) return doc.toString() as T;
	if (doc instanceof Date) return doc.toISOString() as T;
	if (Array.isArray(doc)) return doc.map((item) => serializeDocument(item)) as T;
	if (typeof doc === 'object' && (doc as object).constructor === Object) {
		const result: Record<string, unknown> = {};
		for (const key in doc as Record<string, unknown>) {
			if (Object.hasOwn(doc as object, key)) {
				result[key] = serializeDocument((doc as Record<string, unknown>)[key]);
			}
		}
		return result as T;
	}
	return doc as T;
}

function idFromString(id: string): ObjectId {
	if (!ObjectId.isValid(id)) throw new Error('Identifiant invalide');
	return new ObjectId(id);
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function bibleReferenceId(passage: string): string {
	const slug = passage
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 96);
	return `bible:${slug || 'passage'}`;
}

function moderatorName(user: AdminUser): string {
	return user.name || user.email;
}

export function canPublishOfficialAnswer(user: AdminUser): boolean {
	return canAnswerQuestions(user);
}

export async function ensureQuestionIndexes(): Promise<void> {
	if (indexesReady) return indexesReady;
	indexesReady = (async () => {
		const db = await getDb();
		await Promise.all([
			db.collection('questions').createIndex({ slug: 1 }, { unique: true }),
			db.collection('questions').createIndex({ status: 1, lastActivityAt: -1 }),
			db.collection('questions').createIndex({ status: 1, featured: -1, answeredAt: -1 }),
			db.collection('questions').createIndex({ authorId: 1, createdAt: -1 }),
			db.collection('questions').createIndex({ category: 1, status: 1, lastActivityAt: -1 }),
			db.collection('questions').createIndex({ contentFingerprint: 1, authorId: 1, createdAt: -1 }),
			db.collection('questions').createIndex({ title: 'text', body: 'text', tags: 'text' }),
			db
				.collection('questionReplies')
				.createIndex({ questionId: 1, visibilityStatus: 1, createdAt: 1 }),
			db.collection('questionReplies').createIndex({ authorId: 1, createdAt: -1 }),
			db.collection('questionReports').createIndex({ status: 1, createdAt: -1 }),
			db
				.collection('questionReports')
				.createIndex({ targetType: 1, targetId: 1, reporterId: 1 }, { unique: true }),
			db.collection('questionReferences').createIndex({ questionId: 1, replyId: 1 }),
			db.collection('moderationActions').createIndex({ targetType: 1, targetId: 1, createdAt: -1 }),
			db
				.collection('notifications')
				.createIndex({ recipientType: 1, recipientId: 1, readAt: 1, createdAt: -1 })
		]);
	})();
	return indexesReady;
}

async function recordModerationAction(input: {
	targetType: string;
	targetId: string;
	moderator: AdminUser;
	action: string;
	reason?: string | null;
}): Promise<void> {
	const db = await getDb();
	await db.collection('moderationActions').insertOne({
		targetType: input.targetType,
		targetId: input.targetId,
		moderatorId: input.moderator.email,
		moderatorDisplayName: moderatorName(input.moderator),
		action: input.action,
		reason: input.reason ?? null,
		createdAt: new Date()
	});
}

async function createQuestionNotification(notification: {
	recipientType: 'user' | 'role';
	recipientId: string;
	type: string;
	title: string;
	body: string;
	href: string;
}): Promise<void> {
	const db = await getDb();
	await db.collection('notifications').insertOne({
		...notification,
		readAt: null,
		createdAt: new Date()
	});
}

function buildAdminQuestionQuery(options: {
	status?: string;
	search?: string;
	answered?: string;
}): Filter<Document> {
	const conditions: Filter<Document>[] = [
		{ $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] }
	];
	if (options.status && options.status !== 'all') {
		conditions.push({ status: options.status });
	}
	if (options.answered === 'answered') {
		conditions.push({ officialAnswerId: { $ne: null } });
	} else if (options.answered === 'unanswered') {
		conditions.push({ officialAnswerId: null });
	}
	if (options.search?.trim()) {
		const escaped = escapeRegex(options.search.trim());
		conditions.push({
			$or: [
				{ title: { $regex: escaped, $options: 'i' } },
				{ body: { $regex: escaped, $options: 'i' } },
				{ authorDisplayName: { $regex: escaped, $options: 'i' } },
				{ authorId: { $regex: escaped, $options: 'i' } }
			]
		});
	}
	return { $and: conditions };
}

export async function listAdminQuestions(options: {
	status?: string;
	search?: string;
	answered?: string;
	page?: number;
	limit?: number;
}): Promise<{
	questions: Question[];
	total: number;
	stats: { pending: number; openReports: number; hidden: number };
}> {
	await ensureQuestionIndexes();
	const db = await getDb();
	const page = Math.max(1, options.page ?? 1);
	const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
	const query = buildAdminQuestionQuery(options);
	const sort: Sort = { lastActivityAt: -1, createdAt: -1 };

	const [questions, total, pending, openReports, hidden] = await Promise.all([
		db
			.collection('questions')
			.find(query)
			.sort(sort)
			.skip((page - 1) * limit)
			.limit(limit)
			.toArray(),
		db.collection('questions').countDocuments(query),
		db.collection('questions').countDocuments({
			status: 'pending',
			$or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
		}),
		db.collection('questionReports').countDocuments({ status: 'open' }),
		db.collection('questions').countDocuments({
			status: 'hidden',
			$or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
		})
	]);

	return {
		questions: questions.map((doc) => serializeDocument<Question>(doc)),
		total,
		stats: { pending, openReports, hidden }
	};
}

export async function getQuestionAdminDetail(id: string): Promise<{
	question: Question;
	officialAnswer: QuestionReply | null;
	replies: QuestionReply[];
	references: QuestionReference[];
	reports: QuestionReport[];
	actions: ModerationAction[];
} | null> {
	await ensureQuestionIndexes();
	const db = await getDb();
	const questionDoc = await db.collection('questions').findOne({ _id: idFromString(id) });
	if (!questionDoc) return null;
	const question = serializeDocument<Question>(questionDoc);

	const [replyDocs, referenceDocs, reportDocs, actionDocs] = await Promise.all([
		db
			.collection('questionReplies')
			.find({ questionId: question._id })
			.sort({ createdAt: 1 })
			.toArray(),
		db
			.collection('questionReferences')
			.find({ questionId: question._id })
			.sort({ createdAt: 1 })
			.toArray(),
		db
			.collection('questionReports')
			.find({ questionId: question._id })
			.sort({ createdAt: -1 })
			.toArray(),
		db
			.collection('moderationActions')
			.find({ targetId: question._id })
			.sort({ createdAt: -1 })
			.limit(30)
			.toArray()
	]);

	const replies = replyDocs.map((doc) => serializeDocument<QuestionReply>(doc));
	const officialAnswer =
		replies.find((reply) => reply._id === question.officialAnswerId) ??
		replies.find((reply) => reply.isOfficial) ??
		null;

	return {
		question,
		officialAnswer,
		replies,
		references: referenceDocs.map((doc) => serializeDocument<QuestionReference>(doc)),
		reports: reportDocs.map((doc) => serializeDocument<QuestionReport>(doc)),
		actions: actionDocs.map((doc) => serializeDocument<ModerationAction>(doc))
	};
}

export async function updateQuestionModeration(input: {
	id: string;
	action: string;
	reason: string | null;
	moderator: AdminUser;
}): Promise<void> {
	await ensureQuestionIndexes();
	const db = await getDb();
	const now = new Date();
	const question = await db.collection('questions').findOne({ _id: idFromString(input.id) });
	if (!question) throw new Error('Question introuvable');

	const set: Record<string, unknown> = { updatedAt: now };
	if (input.reason) set.moderationReason = input.reason;

	if (input.action === 'approve') {
		set.status = question.officialAnswerId ? 'answered' : 'approved';
		set.approvedAt = question.approvedAt ?? now;
		set.deletedAt = null;
	} else if (input.action === 'reject') {
		set.status = 'rejected';
	} else if (input.action === 'hide') {
		set.status = 'hidden';
	} else if (input.action === 'unhide') {
		set.status = question.officialAnswerId ? 'answered' : 'approved';
		set.deletedAt = null;
	} else if (input.action === 'archive') {
		set.status = 'archived';
	} else if (input.action === 'soft_delete') {
		set.status = 'hidden';
		set.deletedAt = now;
		set.featured = false;
		set.locked = true;
	} else if (input.action === 'lock') {
		set.locked = true;
	} else if (input.action === 'unlock') {
		set.locked = false;
	} else if (input.action === 'feature') {
		set.featured = true;
	} else if (input.action === 'unfeature') {
		set.featured = false;
	} else {
		throw new Error('Action inconnue');
	}

	await db.collection('questions').updateOne({ _id: question._id }, { $set: set });
	await recordModerationAction({
		targetType: 'question',
		targetId: input.id,
		moderator: input.moderator,
		action: input.action,
		reason: input.reason
	});
}

export async function permanentlyDeleteQuestion(input: {
	id: string;
	moderator: AdminUser;
	reason: string | null;
}): Promise<void> {
	await ensureQuestionIndexes();
	const db = await getDb();
	const questionId = idFromString(input.id);
	const question = await db.collection('questions').findOne({ _id: questionId });
	if (!question) throw new Error('Question introuvable');

	await recordModerationAction({
		targetType: 'question',
		targetId: input.id,
		moderator: input.moderator,
		action: 'permanent_delete',
		reason: input.reason
	});

	await Promise.all([
		db.collection('questions').deleteOne({ _id: questionId }),
		db.collection('questionReplies').deleteMany({ questionId: input.id }),
		db.collection('questionReferences').deleteMany({ questionId: input.id }),
		db.collection('questionReports').deleteMany({ questionId: input.id }),
		db.collection('notifications').deleteMany({ href: `/questions/${String(question.slug || '')}` })
	]);
}

export async function editQuestionForModeration(input: {
	id: string;
	title: string;
	body: string;
	category: string | null;
	tags: string[];
	moderator: AdminUser;
	reason: string | null;
}): Promise<void> {
	const db = await getDb();
	await db.collection('questions').updateOne(
		{ _id: idFromString(input.id) },
		{
			$set: {
				title: input.title,
				body: input.body,
				category: input.category,
				tags: input.tags,
				updatedAt: new Date(),
				moderationReason: input.reason
			}
		}
	);
	await recordModerationAction({
		targetType: 'question',
		targetId: input.id,
		moderator: input.moderator,
		action: 'edit',
		reason: input.reason
	});
}

export async function setReplyVisibility(input: {
	replyId: string;
	visibilityStatus: 'visible' | 'hidden' | 'deleted';
	reason: string | null;
	moderator: AdminUser;
}): Promise<void> {
	const db = await getDb();
	const now = new Date();
	const set: Record<string, unknown> = {
		visibilityStatus: input.visibilityStatus,
		moderationReason: input.reason,
		updatedAt: now
	};
	if (input.visibilityStatus === 'deleted') set.deletedAt = now;
	else set.deletedAt = null;

	await db
		.collection('questionReplies')
		.updateOne({ _id: idFromString(input.replyId) }, { $set: set });
	await recordModerationAction({
		targetType: 'reply',
		targetId: input.replyId,
		moderator: input.moderator,
		action: input.visibilityStatus,
		reason: input.reason
	});
}

export async function upsertOfficialAnswer(input: {
	questionId: string;
	body: string;
	moderator: AdminUser;
}): Promise<string> {
	await ensureQuestionIndexes();
	const db = await getDb();
	const now = new Date();
	const question = await db
		.collection('questions')
		.findOne({ _id: idFromString(input.questionId) });
	if (!question) throw new Error('Question introuvable');

	let replyId = question.officialAnswerId as string | null;
	if (replyId && ObjectId.isValid(replyId)) {
		await db.collection('questionReplies').updateOne(
			{ _id: idFromString(replyId) },
			{
				$set: {
					body: input.body,
					visibilityStatus: 'visible',
					updatedAt: now
				}
			}
		);
	} else {
		const result = await db.collection('questionReplies').insertOne({
			questionId: input.questionId,
			parentReplyId: null,
			body: input.body,
			authorId: input.moderator.email,
			authorDisplayName: moderatorName(input.moderator),
			authorRole: input.moderator.role,
			isOfficial: true,
			visibilityStatus: 'visible',
			moderationReason: null,
			reportCount: 0,
			createdAt: now,
			updatedAt: now,
			deletedAt: null
		});
		replyId = result.insertedId.toString();
	}

	await db.collection('questions').updateOne(
		{ _id: question._id },
		{
			$set: {
				status: 'answered' satisfies QuestionStatus,
				officialAnswerId: replyId,
				answeredAt: question.answeredAt ?? now,
				approvedAt: question.approvedAt ?? now,
				lastActivityAt: now,
				updatedAt: now
			}
		}
	);

	await createQuestionNotification({
		recipientType: 'user',
		recipientId: String(question.authorId),
		type: 'question.answered',
		title: 'Votre question a reçu une réponse',
		body: String(question.title || 'Question'),
		href: `/questions/${question.slug}`
	});

	await recordModerationAction({
		targetType: 'question',
		targetId: input.questionId,
		moderator: input.moderator,
		action: 'official_answer',
		reason: null
	});

	return replyId;
}

function optionFromDoc(type: QuestionReferenceType, doc: Document): ReferenceOption | null {
	if (type === 'bible' || type === 'text') return null;
	const id = doc._id?.toString?.();
	if (!id) return null;

	if (type === 'pdf') {
		const href = String(doc.url || '');
		if (!href) return null;
		return {
			id,
			type,
			title: String(doc.filename || 'PDF'),
			href,
			metadata: {
				size: doc.size ?? null,
				date: doc.publishedOn ? new Date(doc.publishedOn as Date).toISOString().slice(0, 10) : null
			}
		};
	}

	if (type === 'video') {
		const youtubeId = String(doc.id || doc.display_id || '');
		const href = String(
			doc.webpage_url || (youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : '')
		);
		if (!href) return null;
		return {
			id,
			type,
			title: String(doc.title || doc.fulltitle || 'Vidéo'),
			href,
			metadata: {
				duration: doc.duration_string ?? null,
				date: doc.upload_date ?? null
			}
		};
	}

	if (type === 'music') {
		const href = String(doc.s3_url || '');
		if (!href) return null;
		return {
			id,
			type,
			title: String(doc.title || 'Audio'),
			href,
			metadata: {
				artist: doc.artist ?? null,
				duration: typeof doc.duration === 'number' ? `${Math.round(doc.duration / 60)} min` : null
			}
		};
	}

	const href = String(
		doc.pdf_url || doc.mp3_url || doc.english_pdf_url || doc.english_audio_url || ''
	);
	if (!href) return null;
	return {
		id,
		type,
		title: String(doc.french_title || doc.english_title || doc.full_date_code || 'Prédication'),
		href,
		metadata: {
			author: doc.author ?? null,
			date: doc.iso_date ?? null,
			duration: typeof doc.duration === 'number' ? `${Math.round(doc.duration / 60)} min` : null
		}
	};
}

export async function listReferenceOptions(
	search = '',
	limit = 25
): Promise<Record<QuestionReferenceType, ReferenceOption[]>> {
	const db = await getDb();
	const escaped = search.trim() ? escapeRegex(search.trim()) : '';
	const regex = escaped ? { $regex: escaped, $options: 'i' } : undefined;
	const resultLimit = Math.min(Math.max(limit, 1), 50);
	const [pdfs, videos, sermons] = await Promise.all([
		db
			.collection('pdfs')
			.find(regex ? { $or: [{ filename: regex }, { url: regex }] } : {})
			.sort({ publishedOn: -1 })
			.limit(resultLimit)
			.toArray(),
		db
			.collection('videos')
			.find(
				regex
					? {
							$or: [
								{ title: regex },
								{ fulltitle: regex },
								{ display_id: regex },
								{ webpage_url: regex }
							]
						}
					: {}
			)
			.sort({ release_timestamp: -1 })
			.limit(resultLimit)
			.toArray(),
		db
			.collection('sermons')
			.find(
				regex
					? {
							$or: [
								{ french_title: regex },
								{ english_title: regex },
								{ full_date_code: regex },
								{ author: regex },
								{ pdf_url: regex },
								{ mp3_url: regex }
							]
						}
					: {}
			)
			.sort({ iso_date: -1 })
			.limit(resultLimit)
			.toArray()
	]);

	const sermonOptions = sermons
		.map((doc) => optionFromDoc('sermon', doc))
		.filter((option): option is ReferenceOption => Boolean(option));

	return {
		pdf: pdfs
			.map((doc) => optionFromDoc('pdf', doc))
			.filter((option): option is ReferenceOption => Boolean(option)),
		video: videos
			.map((doc) => optionFromDoc('video', doc))
			.filter((option): option is ReferenceOption => Boolean(option)),
		sermon: sermonOptions,
		audio: sermonOptions.map((option) => ({ ...option, type: 'audio' })),
		text: [],
		music: [],
		bible: []
	};
}

async function resolveReferenceOption(
	type: QuestionReferenceType,
	referencedContentId: string
): Promise<ReferenceOption> {
	if (type === 'bible' || type === 'text') {
		throw new Error('Cette référence est ajoutée manuellement');
	}
	const db = await getDb();
	const collectionName =
		type === 'pdf'
			? 'pdfs'
			: type === 'video'
				? 'videos'
				: type === 'music'
					? 'music_audio'
					: 'sermons';
	const doc = await db
		.collection(collectionName)
		.findOne({ _id: idFromString(referencedContentId) });
	const option = doc ? optionFromDoc(type, doc) : null;
	if (!option) throw new Error('Référence introuvable');
	return option;
}

export async function addQuestionReference(input: {
	questionId: string;
	replyId: string | null;
	type: QuestionReferenceType;
	referencedContentId: string;
	moderator: AdminUser;
}): Promise<void> {
	await ensureQuestionIndexes();
	const db = await getDb();
	const option = await resolveReferenceOption(input.type, input.referencedContentId);
	await db.collection('questionReferences').insertOne({
		questionId: input.questionId,
		replyId: input.replyId,
		type: input.type,
		referencedContentId: input.referencedContentId,
		title: option.title,
		href: option.href,
		metadata: option.metadata,
		createdAt: new Date(),
		createdBy: input.moderator.email
	});
	await recordModerationAction({
		targetType: 'question',
		targetId: input.questionId,
		moderator: input.moderator,
		action: 'add_reference',
		reason: option.title
	});
}

export async function addBibleQuestionReference(input: {
	questionId: string;
	replyId: string | null;
	passage: string;
	text: string | null;
	translation: string | null;
	moderator: AdminUser;
}): Promise<void> {
	await ensureQuestionIndexes();
	const db = await getDb();
	await db.collection('questionReferences').insertOne({
		questionId: input.questionId,
		replyId: input.replyId,
		type: 'bible',
		referencedContentId: bibleReferenceId(input.passage),
		title: input.passage,
		href: '',
		metadata: {
			text: input.text,
			translation: input.translation
		},
		createdAt: new Date(),
		createdBy: input.moderator.email
	});
	await recordModerationAction({
		targetType: 'question',
		targetId: input.questionId,
		moderator: input.moderator,
		action: 'add_reference',
		reason: input.passage
	});
}

export async function addManualQuestionReference(input: {
	questionId: string;
	replyId: string | null;
	type: Exclude<QuestionReferenceType, 'bible' | 'music'>;
	title: string;
	href: string;
	note: string | null;
	moderator: AdminUser;
}): Promise<void> {
	await ensureQuestionIndexes();
	const db = await getDb();
	const referencedContentId = `manual:${createHash('sha1').update(`${input.type}:${input.href}`).digest('hex')}`;
	await db.collection('questionReferences').insertOne({
		questionId: input.questionId,
		replyId: input.replyId,
		type: input.type,
		referencedContentId,
		title: input.title,
		href: input.href,
		metadata: {
			manual: true,
			text: input.note
		},
		createdAt: new Date(),
		createdBy: input.moderator.email
	});
	await recordModerationAction({
		targetType: 'question',
		targetId: input.questionId,
		moderator: input.moderator,
		action: 'add_reference',
		reason: input.title
	});
}

export async function removeQuestionReference(input: {
	referenceId: string;
	questionId: string;
	moderator: AdminUser;
}): Promise<void> {
	const db = await getDb();
	const result = await db.collection('questionReferences').deleteOne({
		_id: idFromString(input.referenceId),
		questionId: input.questionId
	});
	if (result.deletedCount === 0) throw new Error('Référence introuvable');
	await recordModerationAction({
		targetType: 'question',
		targetId: input.questionId,
		moderator: input.moderator,
		action: 'remove_reference',
		reason: null
	});
}

export async function listOpenReports(options: {
	page?: number;
	limit?: number;
}): Promise<{ reports: QuestionReport[]; questions: Record<string, Question>; total: number }> {
	await ensureQuestionIndexes();
	const db = await getDb();
	const page = Math.max(1, options.page ?? 1);
	const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
	const [reportDocs, total] = await Promise.all([
		db
			.collection('questionReports')
			.find({ status: 'open' })
			.sort({ createdAt: -1 })
			.skip((page - 1) * limit)
			.limit(limit)
			.toArray(),
		db.collection('questionReports').countDocuments({ status: 'open' })
	]);
	const reports = reportDocs.map((doc) => serializeDocument<QuestionReport>(doc));
	const questionIds = [...new Set(reports.map((report) => report.questionId))]
		.filter((id) => ObjectId.isValid(id))
		.map((id) => new ObjectId(id));
	const questionDocs = questionIds.length
		? await db
				.collection('questions')
				.find({ _id: { $in: questionIds } })
				.toArray()
		: [];
	const questions = Object.fromEntries(
		questionDocs.map((doc) => {
			const question = serializeDocument<Question>(doc);
			return [question._id, question];
		})
	);
	return { reports, questions, total };
}

export async function resolveQuestionReport(input: {
	reportId: string;
	status: 'reviewed' | 'dismissed';
	moderator: AdminUser;
}): Promise<void> {
	const db = await getDb();
	await db.collection('questionReports').updateOne(
		{ _id: idFromString(input.reportId) },
		{
			$set: {
				status: input.status,
				resolvedBy: input.moderator.email,
				resolvedAt: new Date()
			}
		}
	);
	await recordModerationAction({
		targetType: 'report',
		targetId: input.reportId,
		moderator: input.moderator,
		action: input.status,
		reason: null
	});
}
