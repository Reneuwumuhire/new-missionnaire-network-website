import { error, fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { toggleAdminUserActive, logAudit } from '../../../db/collections';
import {
	canAnswerQuestions,
	canModerateQuestions,
	canViewQuestionsAdmin
} from '$lib/models/admin-user';
import {
	addBibleQuestionReference,
	addQuestionReference,
	canPublishOfficialAnswer,
	editQuestionForModeration,
	getQuestionAdminDetail,
	listReferenceOptions,
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
	validateModerationReason,
	validateOfficialAnswer
} from '$lib/questions/validation';

const REFERENCE_TYPES: QuestionReferenceType[] = ['pdf', 'audio', 'video', 'sermon', 'music', 'bible'];

export const load: PageServerLoad = async ({ params, locals, url }) => {
	if (!canViewQuestionsAdmin(locals.user)) throw error(403, 'Accès refusé');
	const detail = await getQuestionAdminDetail(params.id);
	if (!detail) throw error(404, 'Question introuvable');
	const referenceSearch = url.searchParams.get('referenceSearch') ?? '';
	return {
		...detail,
		canPublishOfficial: canPublishOfficialAnswer(locals.user),
		canAnswer: canAnswerQuestions(locals.user),
		canModerate: canModerateQuestions(locals.user),
		canManageUsers: locals.user.role === 'superadmin',
		referenceOptions: await listReferenceOptions(referenceSearch),
		referenceSearch
	};
};

export const actions: Actions = {
	moderate: async ({ request, params, locals }) => {
		if (!canModerateQuestions(locals.user)) throw error(403, 'Accès refusé');
		if (!params.id) return fail(400, { error: 'Question invalide' });
		const formData = await request.formData();
		const action = formData.get('actionName')?.toString();
		if (!action) return fail(400, { error: 'Action invalide' });
		await updateQuestionModeration({
			id: params.id,
			action,
			reason: validateModerationReason(formData.get('reason')),
			moderator: locals.user
		});
		return { success: true };
	},

	edit: async ({ request, params, locals }) => {
		if (!canModerateQuestions(locals.user)) throw error(403, 'Accès refusé');
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
			moderator: locals.user,
			reason: validateModerationReason(formData.get('reason'))
		});
		return { editSuccess: true };
	},

	official: async ({ request, params, locals }) => {
		if (!params.id) return fail(400, { officialError: 'Question invalide' });
		if (!canPublishOfficialAnswer(locals.user)) {
			throw error(403, 'Permission requise pour publier une réponse officielle.');
		}
		const formData = await request.formData();
		const parsed = validateOfficialAnswer(formData.get('body'));
		if (!parsed.ok) return fail(400, { officialError: parsed.error });
		await upsertOfficialAnswer({ questionId: params.id, body: parsed.body, moderator: locals.user });
		return { officialSuccess: true };
	},

	replyVisibility: async ({ request, locals }) => {
		if (!canModerateQuestions(locals.user)) throw error(403, 'Accès refusé');
		const formData = await request.formData();
		const replyId = formData.get('replyId')?.toString();
		const visibilityStatus = formData.get('visibilityStatus')?.toString();
		if (!replyId || !['visible', 'hidden', 'deleted'].includes(visibilityStatus ?? '')) {
			return fail(400, { error: 'Paramètres invalides' });
		}
		await setReplyVisibility({
			replyId,
			visibilityStatus: visibilityStatus as 'visible' | 'hidden' | 'deleted',
			reason: validateModerationReason(formData.get('reason')),
			moderator: locals.user
		});
		return { success: true };
	},

	addReference: async ({ request, params, locals }) => {
		if (!canAnswerQuestions(locals.user)) throw error(403, 'Accès refusé');
		if (!params.id) return fail(400, { referenceError: 'Question invalide' });
		const formData = await request.formData();
		const type = formData.get('type')?.toString() as QuestionReferenceType;
		const referencedContentId = formData.get('referencedContentId')?.toString();
		const replyIdValue = formData.get('replyId')?.toString();
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
				moderator: locals.user
			});
			return { referenceSuccess: true };
		}
		if (!referencedContentId) return fail(400, { referenceError: 'Référence invalide' });
		await addQuestionReference({
			questionId: params.id,
			replyId: replyIdValue || null,
			type,
			referencedContentId,
			moderator: locals.user
		});
		return { referenceSuccess: true };
	},

	removeReference: async ({ request, params, locals }) => {
		if (!canAnswerQuestions(locals.user)) throw error(403, 'Accès refusé');
		if (!params.id) return fail(400, { referenceError: 'Question invalide' });
		const formData = await request.formData();
		const referenceId = formData.get('referenceId')?.toString();
		if (!referenceId) return fail(400, { referenceError: 'Référence invalide' });
		await removeQuestionReference({ referenceId, questionId: params.id, moderator: locals.user });
		return { referenceSuccess: true };
	},

	resolveReport: async ({ request, locals }) => {
		if (!canModerateQuestions(locals.user)) throw error(403, 'Accès refusé');
		const formData = await request.formData();
		const reportId = formData.get('reportId')?.toString();
		const status = formData.get('status')?.toString();
		if (!reportId || (status !== 'reviewed' && status !== 'dismissed')) {
			return fail(400, { error: 'Paramètres invalides' });
		}
		await resolveQuestionReport({ reportId, status, moderator: locals.user });
		return { success: true };
	},

	suspendAuthor: async ({ request, locals, getClientAddress }) => {
		if (locals.user.role !== 'superadmin') {
			return fail(403, { suspendError: 'Accès refusé' });
		}
		const formData = await request.formData();
		const authorId = formData.get('authorId')?.toString();
		if (!authorId) return fail(400, { suspendError: 'Auteur invalide' });
		await toggleAdminUserActive(authorId, false);
		await logAudit({
			user_id: locals.user._id ?? locals.user.email,
			user_email: locals.user.email,
			action: 'update',
			target_collection: 'admin_users',
			target_id: authorId,
			changes: { is_active: { old: true, new: false } },
			ip_address: getClientAddress()
		});
		return { suspendSuccess: true };
	}
};
