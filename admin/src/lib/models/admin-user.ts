import { z } from 'zod';

export const PermissionsSchema = z.object({
	can_add: z.boolean().default(true),
	can_edit: z.boolean().default(true),
	can_delete: z.boolean().default(false),
	can_manage_recordings: z.boolean().default(false),
	can_view_questions: z.boolean().default(false),
	can_answer_questions: z.boolean().default(false),
	can_moderate_questions: z.boolean().default(false)
});

export type Permissions = z.infer<typeof PermissionsSchema>;

export const DEFAULT_PERMISSIONS: Permissions = {
	can_add: true,
	can_edit: true,
	can_delete: false,
	can_manage_recordings: false,
	can_view_questions: false,
	can_answer_questions: false,
	can_moderate_questions: false
};

export const SUPERADMIN_PERMISSIONS: Permissions = {
	can_add: true,
	can_edit: true,
	can_delete: true,
	can_manage_recordings: true,
	can_view_questions: true,
	can_answer_questions: true,
	can_moderate_questions: true
};

export const AdminUserSchema = z.object({
	_id: z.string().optional(),
	email: z.string().email(),
	password_hash: z.string(),
	name: z.string(),
	role: z.enum(['superadmin', 'editor']),
	permissions: PermissionsSchema.optional(),
	created_at: z.union([z.instanceof(Date), z.string()]).transform((val) => new Date(val)),
	last_login: z
		.union([z.instanceof(Date), z.string()])
		.transform((val) => new Date(val))
		.nullable(),
	is_active: z.boolean().default(true)
});

export type AdminUser = z.infer<typeof AdminUserSchema>;

/** Resolve effective permissions — superadmins always get full access */
export function getPermissions(user: AdminUser): Permissions {
	if (user.role === 'superadmin') return SUPERADMIN_PERMISSIONS;
	const stored = user.permissions ?? {};
	return { ...DEFAULT_PERMISSIONS, ...stored };
}

export function canViewQuestionsAdmin(user: AdminUser): boolean {
	return getPermissions(user).can_view_questions;
}

export function canAnswerQuestions(user: AdminUser): boolean {
	return getPermissions(user).can_answer_questions;
}

export function canModerateQuestions(user: AdminUser): boolean {
	return getPermissions(user).can_moderate_questions;
}

export function canDeleteQuestions(user: AdminUser): boolean {
	const permissions = getPermissions(user);
	return permissions.can_moderate_questions && permissions.can_delete;
}

export function canDeleteRecordings(user: AdminUser): boolean {
	const permissions = getPermissions(user);
	return permissions.can_manage_recordings && permissions.can_delete;
}

export function canManageMusicAudio(user: AdminUser): boolean {
	const permissions = getPermissions(user);
	return permissions.can_add || permissions.can_edit || permissions.can_delete;
}

export function canEditOrDeleteMusicAudio(user: AdminUser): boolean {
	const permissions = getPermissions(user);
	return permissions.can_edit || permissions.can_delete;
}

export function canViewDashboard(user: AdminUser): boolean {
	const permissions = getPermissions(user);
	return user.role === 'superadmin' || permissions.can_manage_recordings || canManageMusicAudio(user);
}
