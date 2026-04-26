import { createHash } from 'crypto';
import { ObjectId, MongoServerError, type Document, type Filter, type Sort } from 'mongodb';
import { getDb } from './mongo';
import type {
	Question,
	QuestionReference,
	QuestionReply,
	QuestionReport,
	QuestionReportTargetType
} from '$lib/models/questions';
import type { QaUser } from '$lib/server/qa-auth';
import { normalizeForDuplicateCheck, slugifyQuestionTitle } from '$lib/questions/validation';

const PUBLIC_STATUSES = ['approved', 'answered'] as const;
const QUESTION_PAGE_LIMIT_MAX = 30;

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

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function idFromString(id: string): ObjectId {
	if (!ObjectId.isValid(id)) throw new Error('Identifiant invalide');
	return new ObjectId(id);
}

function fingerprint(title: string, body: string): string {
	return createHash('sha256')
		.update(`${normalizeForDuplicateCheck(title)}\n${normalizeForDuplicateCheck(body)}`)
		.digest('hex');
}

function actorFields(user: QaUser) {
	return {
		authorId: user.email,
		authorDisplayName: user.name,
		authorRole: user.role
	};
}

async function ensureQuestionIndexes(): Promise<void> {
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
			db.collection('questionReplies').createIndex({ questionId: 1, visibilityStatus: 1, createdAt: 1 }),
			db.collection('questionReplies').createIndex({ authorId: 1, createdAt: -1 }),
			db.collection('questionReports').createIndex({ status: 1, createdAt: -1 }),
			db
				.collection('questionReports')
				.createIndex({ targetType: 1, targetId: 1, reporterId: 1 }, { unique: true }),
			db.collection('questionReferences').createIndex({ questionId: 1, replyId: 1 }),
			db.collection('moderationActions').createIndex({ targetType: 1, targetId: 1, createdAt: -1 }),
			db.collection('notifications').createIndex({ recipientType: 1, recipientId: 1, readAt: 1, createdAt: -1 })
		]);
	})();
	return indexesReady;
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

async function buildUniqueSlug(title: string): Promise<string> {
	const db = await getDb();
	const base = slugifyQuestionTitle(title);
	let slug = base;
	for (let suffix = 2; suffix < 1000; suffix += 1) {
		const existing = await db.collection('questions').findOne({ slug }, { projection: { _id: 1 } });
		if (!existing) return slug;
		slug = `${base}-${suffix}`;
	}
	return `${base}-${Date.now()}`;
}

function buildPublicQuestionQuery(options: {
	search?: string;
	category?: string;
	answered?: string;
	from?: string;
	to?: string;
}): Filter<Document> {
	const conditions: Filter<Document>[] = [
		{ status: { $in: [...PUBLIC_STATUSES] } },
		{ deletedAt: null }
	];

	if (options.search?.trim()) {
		const escaped = escapeRegex(options.search.trim());
		conditions.push({
			$or: [
				{ title: { $regex: escaped, $options: 'i' } },
				{ body: { $regex: escaped, $options: 'i' } },
				{ tags: { $regex: escaped, $options: 'i' } }
			]
		});
	}

	if (options.category?.trim()) {
		conditions.push({ category: options.category.trim() });
	}

	if (options.answered === 'answered') {
		conditions.push({ status: 'answered' });
	} else if (options.answered === 'unanswered') {
		conditions.push({ status: 'approved', officialAnswerId: null });
	}

	const createdAt: Record<string, Date> = {};
	if (options.from) {
		const from = new Date(options.from);
		if (!Number.isNaN(from.getTime())) createdAt.$gte = from;
	}
	if (options.to) {
		const to = new Date(options.to);
		if (!Number.isNaN(to.getTime())) createdAt.$lte = to;
	}
	if (Object.keys(createdAt).length > 0) conditions.push({ createdAt });

	return { $and: conditions };
}

function sortForQuestions(sort: string): Sort {
	if (sort === 'answered') return { answeredAt: -1, lastActivityAt: -1, _id: -1 };
	if (sort === 'popular') return { viewCount: -1, replyCount: -1, lastActivityAt: -1, _id: -1 };
	if (sort === 'featured') return { featured: -1, answeredAt: -1, lastActivityAt: -1, _id: -1 };
	return { lastActivityAt: -1, createdAt: -1, _id: -1 };
}

export async function listPublicQuestions(options: {
	search?: string;
	sort?: string;
	page?: number;
	limit?: number;
	category?: string;
	answered?: string;
	from?: string;
	to?: string;
}): Promise<{ questions: Question[]; total: number; categories: string[] }> {
	await ensureQuestionIndexes();
	const db = await getDb();
	const page = Math.max(1, options.page ?? 1);
	const limit = Math.min(Math.max(options.limit ?? 12, 1), QUESTION_PAGE_LIMIT_MAX);
	const query = buildPublicQuestionQuery(options);
	const [questions, total, categories] = await Promise.all([
		db
			.collection('questions')
			.find(query)
			.sort(sortForQuestions(options.sort ?? 'newest'))
			.skip((page - 1) * limit)
			.limit(limit)
			.toArray(),
		db.collection('questions').countDocuments(query),
		db.collection('questions').distinct('category', {
			status: { $in: [...PUBLIC_STATUSES] },
			category: { $nin: [null, ''] }
		})
	]);

	return {
		questions: questions.map((doc) => serializeDocument<Question>(doc)),
		total,
		categories: (categories as string[]).filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr'))
	};
}

export async function getPublicQuestionDetail(
	slug: string,
	options: { incrementView?: boolean } = {}
): Promise<{
	question: Question;
	officialAnswer: QuestionReply | null;
	replies: QuestionReply[];
	references: QuestionReference[];
} | null> {
	await ensureQuestionIndexes();
	const db = await getDb();
	const questionDoc = await db.collection('questions').findOne({
		slug,
		status: { $in: [...PUBLIC_STATUSES] },
		deletedAt: null
	});
	if (!questionDoc) return null;

	if (options.incrementView !== false) {
		await db.collection('questions').updateOne({ _id: questionDoc._id }, { $inc: { viewCount: 1 } });
		questionDoc.viewCount = (questionDoc.viewCount ?? 0) + 1;
	}

	const question = serializeDocument<Question>(questionDoc);
	const [replyDocs, referenceDocs] = await Promise.all([
		db
			.collection('questionReplies')
			.find({
				questionId: question._id,
				visibilityStatus: 'visible',
				deletedAt: null
			})
			.sort({ isOfficial: -1, createdAt: 1 })
			.toArray(),
		db.collection('questionReferences').find({ questionId: question._id }).sort({ createdAt: 1 }).toArray()
	]);

	const replies = replyDocs.map((doc) => serializeDocument<QuestionReply>(doc));
	const officialAnswer =
		replies.find((reply) => reply._id === question.officialAnswerId) ??
		replies.find((reply) => reply.isOfficial) ??
		null;

	return {
		question,
		officialAnswer,
		replies: replies.filter((reply) => !reply.isOfficial),
		references: referenceDocs.map((doc) => serializeDocument<QuestionReference>(doc))
	};
}

export async function createQuestion(input: {
	title: string;
	body: string;
	category: string | null;
	tags: string[];
	author: QaUser;
	clientKey: string;
}): Promise<{ ok: true; slug: string; id: string } | { ok: false; error: string }> {
	await ensureQuestionIndexes();
	const db = await getDb();
	const now = new Date();
	const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
	const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
	const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
	const authorId = input.author.email;

	const [recentBurst, recentDay] = await Promise.all([
		db.collection('questions').countDocuments({ authorId, createdAt: { $gte: tenMinutesAgo } }),
		db.collection('questions').countDocuments({ authorId, createdAt: { $gte: dayAgo } })
	]);

	if (recentBurst >= 2 || recentDay >= 10) {
		return { ok: false, error: 'Merci de patienter avant de soumettre une nouvelle question.' };
	}

	const contentFingerprint = fingerprint(input.title, input.body);
	const duplicate = await db.collection('questions').findOne({
		authorId,
		contentFingerprint,
		createdAt: { $gte: monthAgo },
		status: { $nin: ['rejected'] }
	});
	if (duplicate) {
		return { ok: false, error: 'Une question très similaire a déjà été envoyée.' };
	}

	const slug = await buildUniqueSlug(input.title);
	const result = await db.collection('questions').insertOne({
		slug,
		title: input.title,
		body: input.body,
		...actorFields(input.author),
		status: 'pending',
		category: input.category,
		tags: input.tags,
		officialAnswerId: null,
		replyCount: 0,
		viewCount: 0,
		reportCount: 0,
		featured: false,
		locked: false,
		moderationReason: null,
		contentFingerprint,
		clientKey: input.clientKey,
		approvedAt: null,
		answeredAt: null,
		lastActivityAt: now,
		createdAt: now,
		updatedAt: now,
		deletedAt: null
	});

	await createQuestionNotification({
		recipientType: 'role',
		recipientId: 'moderator',
		type: 'question.pending',
		title: 'Nouvelle question en attente',
		body: input.title,
		href: `/questions/${result.insertedId.toString()}`
	});

	return { ok: true, slug, id: result.insertedId.toString() };
}

export async function createQuestionReply(input: {
	questionId: string;
	body: string;
	author: QaUser;
}): Promise<{ ok: true } | { ok: false; error: string }> {
	await ensureQuestionIndexes();
	const db = await getDb();
	const now = new Date();
	const question = await db.collection('questions').findOne({
		_id: idFromString(input.questionId),
		status: { $in: [...PUBLIC_STATUSES] },
		deletedAt: null
	});

	if (!question) return { ok: false, error: 'Question introuvable.' };
	if (question.locked === true) return { ok: false, error: 'Cette discussion est verrouillée.' };

	const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
	const recentReplies = await db.collection('questionReplies').countDocuments({
		authorId: input.author.email,
		createdAt: { $gte: tenMinutesAgo }
	});
	if (recentReplies >= 5) {
		return { ok: false, error: 'Merci de patienter avant de publier une autre réponse.' };
	}

	const duplicate = await db.collection('questionReplies').findOne({
		questionId: input.questionId,
		authorId: input.author.email,
		body: input.body,
		createdAt: { $gte: new Date(now.getTime() - 60 * 60 * 1000) }
	});
	if (duplicate) return { ok: false, error: 'Cette réponse a déjà été publiée.' };

	await db.collection('questionReplies').insertOne({
		questionId: input.questionId,
		parentReplyId: null,
		body: input.body,
		...actorFields(input.author),
		isOfficial: false,
		visibilityStatus: 'visible',
		moderationReason: null,
		reportCount: 0,
		createdAt: now,
		updatedAt: now,
		deletedAt: null
	});

	await db.collection('questions').updateOne(
		{ _id: question._id },
		{
			$inc: { replyCount: 1 },
			$set: { lastActivityAt: now, updatedAt: now }
		}
	);

	return { ok: true };
}

export async function reportQuestionContent(input: {
	targetType: QuestionReportTargetType;
	targetId: string;
	questionId: string;
	reason: string;
	notes: string | null;
	reporter: QaUser;
}): Promise<{ ok: true } | { ok: false; error: string }> {
	await ensureQuestionIndexes();
	const db = await getDb();
	const question = await db.collection('questions').findOne({ _id: idFromString(input.questionId) });
	if (!question) return { ok: false, error: 'Question introuvable.' };

	if (input.targetType === 'reply') {
		const reply = await db.collection('questionReplies').findOne({
			_id: idFromString(input.targetId),
			questionId: input.questionId
		});
		if (!reply) return { ok: false, error: 'Réponse introuvable.' };
	}

	try {
		await db.collection('questionReports').insertOne({
			targetType: input.targetType,
			targetId: input.targetId,
			questionId: input.questionId,
			reporterId: input.reporter.email,
			reporterDisplayName: input.reporter.name,
			reason: input.reason,
			notes: input.notes,
			status: 'open',
			resolvedBy: null,
			resolvedAt: null,
			createdAt: new Date()
		});
	} catch (error) {
		if (error instanceof MongoServerError && error.code === 11000) {
			return { ok: false, error: 'Vous avez déjà signalé ce contenu.' };
		}
		throw error;
	}

	if (input.targetType === 'question') {
		await db.collection('questions').updateOne({ _id: question._id }, { $inc: { reportCount: 1 } });
	} else {
		await db
			.collection('questionReplies')
			.updateOne({ _id: idFromString(input.targetId) }, { $inc: { reportCount: 1 } });
	}

	await createQuestionNotification({
		recipientType: 'role',
		recipientId: 'moderator',
		type: 'question.reported',
		title: 'Contenu signalé',
		body: `${input.reason}: ${question.title ?? 'Question'}`,
		href: `/questions/reports`
	});

	return { ok: true };
}
