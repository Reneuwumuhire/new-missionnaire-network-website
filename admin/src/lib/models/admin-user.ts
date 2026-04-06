import { z } from 'zod';

export const PermissionsSchema = z.object({
	can_add: z.boolean().default(true),
	can_edit: z.boolean().default(true),
	can_delete: z.boolean().default(false)
});

export type Permissions = z.infer<typeof PermissionsSchema>;

export const DEFAULT_PERMISSIONS: Permissions = {
	can_add: true,
	can_edit: true,
	can_delete: false
};

export const SUPERADMIN_PERMISSIONS: Permissions = {
	can_add: true,
	can_edit: true,
	can_delete: true
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
	return user.permissions ?? DEFAULT_PERMISSIONS;
}
