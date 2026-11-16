import { objectIdString } from '$lib/server/mongo-input';
import { verifyAdminSession } from '$lib/server/admin-session';
import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { toggleAdminUserActive, logAudit } from '../../../db/collections';
import {
	canAnswerQuestions,
	canDeleteQuestions,
	canModerateQuestions,
	canViewQuestionsAdmin
} from '$lib/models/admin-user';
import {
	addBibleQuestionReference,
	addManualQuestionReference,
	addQuestionReference,
	canPublishOfficialAnswer,
	editQuestionForModeration,
	getQuestionAdminDetail,
	listReferenceOptions,
	permanentlyDeleteQuestion,
	removeQuestionReference,
	resolveQuestionReport,
	setReplyVisibility,
	updateQuestionModeration,
	upsertOfficialAnswer
} from '../../../db/questions';
import type { QuestionReferenceType } from '$lib/models/questions';
import {
	validateBibleReference,
	validateEditedQuestion,
	validateManualReference,
	validateModerationReason,
	validateOfficialAnswer
} from '$lib/questions/validation';

const REFERENCE_TYPES: QuestionReferenceType[] = [
	'pdf',
	'audio',
	'video',
	'sermon',
	'text',
	'bible'
];

export const load: PageServerLoad = async ({ params, url, cookies }) => {
	const adminUser = await verifyAdminSession(cookies);
	if (!canViewQuestionsAdmin(adminUser)) throw error(403, 'Accès refusé');
	const detail = await getQuestionAdminDetail(params.id);
	if (!detail) throw error(404, 'Question introuvable');
	const referenceSearch = url.searchParams.get('referenceSearch') ?? '';
	const referenceTypeParam = url.searchParams.get('referenceType');
	const referenceType = REFERENCE_TYPES.includes(referenceTypeParam as QuestionReferenceType)
		? (referenceTypeParam as QuestionReferenceType)
		: 'sermon';
	return {
		...detail,
		canPublishOfficial: canPublishOfficialAnswer(adminUser),
		canAnswer: canAnswerQuestions(adminUser),
		canModerate: canModerateQuestions(adminUser),
		canDelete: canDeleteQuestions(adminUser),
		canDeletePermanently: adminUser.role === 'superadmin',
		canManageUsers: adminUser.role === 'superadmin',
		referenceOptions: await listReferenceOptions(referenceSearch, 25),
		referenceType,
		referenceSearch
	};
};

export const actions: Actions = {
	moderate: async ({ request, params, cookies }) => {
		const adminUser = await verifyAdminSession(cookies);
		if (!params.id) return fail(400, { error: 'Question invalide' });
		const formData = await request.formData();
		const action = formData.get('actionName')?.toString();
		if (!action) return fail(400, { error: 'Action invalide' });
		const reason = validateModerationReason(formData.get('reason'));

		if (action === 'permanent_delete') {
			if (adminUser.role !== 'superadmin') throw error(403, 'Accès refusé');
			await permanentlyDeleteQuestion({ id: params.id, reason, moderator: adminUser });
			throw redirect(303, '/questions');
		}

		if (action === 'soft_delete' && !canDeleteQuestions(adminUser)) {
			throw error(403, 'Accès refusé');
		}
		if (!canModerateQuestions(adminUser)) throw error(403, 'Accès refusé');

		await updateQuestionModeration({
			id: params.id,
			action,
			reason,
			moderator: adminUser
		});
		return { success: true };
	},

	edit: async ({ request, params, cookies }) => {
		const adminUser = await verifyAdminSession(cookies);
		if (!canModerateQuestions(adminUser)) throw error(403, 'Accès refusé');
		if (!params.id) return fail(400, { editError: 'Question invalide' });
		const formData = await request.formData();
		const parsed = validateEditedQuestion({
			title: formData.get('title'),
			body: formData.get('body'),
			category: formData.get('category'),
			tags: formData.get('tags')
		});
		if (!parsed.ok) return fail(400, { editError: parsed.error });
		await editQuestionForModeration({
			id: params.id,
			title: parsed.title,
			body: parsed.body,
			category: parsed.category,
			tags: parsed.tags,
			moderator: adminUser,
			reason: validateModerationReason(formData.get('reason'))
		});
		return { editSuccess: true };
	},

	official: async ({ request, params, cookies }) => {
		const adminUser = await verifyAdminSession(cookies);
		if (!params.id) return fail(400, { officialError: 'Question invalide' });
		if (!canPublishOfficialAnswer(adminUser)) {
			throw error(403, 'Permission requise pour publier une réponse officielle.');
		}
		const formData = await request.formData();
		const parsed = validateOfficialAnswer(formData.get('body'));
		if (!parsed.ok) return fail(400, { officialError: parsed.error });
		await upsertOfficialAnswer({
			questionId: params.id,
			body: parsed.body,
			moderator: adminUser
		});
		return { officialSuccess: true };
	},

	replyVisibility: async ({ request, params, cookies }) => {
		const adminUser = await verifyAdminSession(cookies);
		if (!canModerateQuestions(adminUser)) throw error(403, 'Accès refusé');
		const questionId = objectIdString.safeParse(params.id).data;
		const formData = await request.formData();
		const replyId = objectIdString.safeParse(formData.get('replyId')).data;
		const visibilityStatus = formData.get('visibilityStatus')?.toString();
		if (!replyId || !questionId || !['visible', 'hidden', 'deleted'].includes(visibilityStatus ?? '')) {
			return fail(400, { error: 'Paramètres invalides' });
		}
		const updated = await setReplyVisibility({
			replyId,
			questionId,
			visibilityStatus: visibilityStatus as 'visible' | 'hidden' | 'deleted',
			reason: validateModerationReason(formData.get('reason')),
			moderator: adminUser
		});
		if (!updated) return fail(404, { error: 'Réponse introuvable' });
		return { success: true };
	},

	addReference: async ({ request, params, cookies }) => {
		const adminUser = await verifyAdminSession(cookies);
		if (!canAnswerQuestions(adminUser)) throw error(403, 'Accès refusé');
		if (!params.id) return fail(400, { referenceError: 'Question invalide' });
		const formData = await request.formData();
		const type = formData.get('type')?.toString() as QuestionReferenceType;
		const referencedContentId = formData.get('referencedContentId')?.toString();
		const replyIdValue = formData.get('replyId')?.toString();
		const referenceMode = formData.get('referenceMode')?.toString() || 'existing';
		if (!REFERENCE_TYPES.includes(type)) {
			return fail(400, { referenceError: 'Référence invalide' });
		}
		if (type === 'bible') {
			const parsed = validateBibleReference({
				passage: formData.get('biblePassage'),
				text: formData.get('bibleText'),
				translation: formData.get('bibleTranslation')
			});
			if (!parsed.ok) return fail(400, { referenceError: parsed.error });
			await addBibleQuestionReference({
				questionId: params.id,
				replyId: replyIdValue || null,
				passage: parsed.passage,
				text: parsed.text,
				translation: parsed.translation,
				moderator: adminUser
			});
			return { referenceSuccess: true };
		}
		if (referenceMode === 'manual') {
			const parsed = validateManualReference({
				title: formData.get('manualTitle'),
				href: formData.get('manualHref'),
				note: formData.get('manualNote'),
				type
			});
			if (!parsed.ok) return fail(400, { referenceError: parsed.error });
			await addManualQuestionReference({
				questionId: params.id,
				replyId: replyIdValue || null,
				type: type as Exclude<QuestionReferenceType, 'bible' | 'music'>,
				title: parsed.title,
				href: parsed.href,
				note: parsed.note,
				moderator: adminUser
			});
			return { referenceSuccess: true };
		}
		if (!referencedContentId) return fail(400, { referenceError: 'Référence invalide' });
		await addQuestionReference({
			questionId: params.id,
			replyId: replyIdValue || null,
			type,
			referencedContentId,
			moderator: adminUser
		});
		return { referenceSuccess: true };
	},

	removeReference: async ({ request, params, cookies }) => {
		const adminUser = await verifyAdminSession(cookies);
		if (!canAnswerQuestions(adminUser)) throw error(403, 'Accès refusé');
		if (!params.id) return fail(400, { referenceError: 'Question invalide' });
		const formData = await request.formData();
		const referenceId = formData.get('referenceId')?.toString();
		if (!referenceId) return fail(400, { referenceError: 'Référence invalide' });
		await removeQuestionReference({ referenceId, questionId: params.id, moderator: adminUser });
		return { referenceSuccess: true };
	},

	resolveReport: async ({ request, params, cookies }) => {
		const adminUser = await verifyAdminSession(cookies);
		if (!canModerateQuestions(adminUser)) throw error(403, 'Accès refusé');
		const questionId = objectIdString.safeParse(params.id).data;
		const formData = await request.formData();
		const reportId = objectIdString.safeParse(formData.get('reportId')).data;
		const status = formData.get('status')?.toString();
		if (!reportId || !questionId || (status !== 'reviewed' && status !== 'dismissed')) {
			return fail(400, { error: 'Paramètres invalides' });
		}
		const updated = await resolveQuestionReport({
			reportId,
			questionId,
			status,
			moderator: adminUser
		});
		if (!updated) return fail(404, { error: 'Signalement introuvable' });
		return { success: true };
	},

	suspendAuthor: async ({ request, getClientAddress, cookies }) => {
		const adminUser = await verifyAdminSession(cookies);
		if (adminUser.role !== 'superadmin') {
			return fail(403, { suspendError: 'Accès refusé' });
		}
		const formData = await request.formData();
		const authorId = formData.get('authorId')?.toString();
		if (!authorId) return fail(400, { suspendError: 'Auteur invalide' });
		await toggleAdminUserActive(authorId, false);
		await logAudit({
			user_id: adminUser._id ?? adminUser.email,
			user_email: adminUser.email,
			action: 'update',
			target_collection: 'admin_users',
			target_id: authorId,
			changes: { is_active: { old: true, new: false } },
			ip_address: getClientAddress()
		});
		return { suspendSuccess: true };
	}
};
