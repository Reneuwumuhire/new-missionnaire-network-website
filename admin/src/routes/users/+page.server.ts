import { fail, redirect } from '@sveltejs/kit';
import { randomBytes } from 'crypto';
import { hashPassword } from '$lib/server/auth';
import {
	getAllAdminUsers,
	findAdminByEmail,
	createAdminUser,
	toggleAdminUserActive,
	resetAdminPassword,
	updateAdminPermissions,
	logAudit
} from '../../db/collections';
import { getPermissions } from '$lib/models/admin-user';
import type { Actions, PageServerLoad } from './$types';

function generatePassword(length = 12): string {
	const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	const bytes = randomBytes(length);
	let password = '';
	for (let i = 0; i < length; i++) {
		password += chars[bytes[i] % chars.length];
	}
	return password;
}

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user.role !== 'superadmin') {
		throw redirect(303, '/');
	}

	const users = await getAllAdminUsers();
	const usersWithPermissions = users.map((u) => ({
		...u,
		effectivePermissions: getPermissions(u)
	}));
	return { users: usersWithPermissions };
};

export const actions: Actions = {
	create: async ({ request, locals, getClientAddress }) => {
		if (locals.user.role !== 'superadmin') {
			return fail(403, { createError: 'Accès refusé' });
		}

		const formData = await request.formData();
		const email = formData.get('email')?.toString()?.trim()?.toLowerCase();
		const name = formData.get('name')?.toString()?.trim();
		const role = formData.get('role')?.toString() as 'superadmin' | 'editor' | undefined;

		if (!email || !name) {
			return fail(400, { createError: 'Email et nom requis' });
		}

		if (role !== 'superadmin' && role !== 'editor') {
			return fail(400, { createError: 'Rôle invalide' });
		}

		const existing = await findAdminByEmail(email);
		if (existing) {
			return fail(400, { createError: 'Un utilisateur avec cet email existe déjà' });
		}

		const generatedPassword = generatePassword();
		const hash = await hashPassword(generatedPassword);

		await createAdminUser({ email, password_hash: hash, name, role });

		await logAudit({
			user_id: locals.user.email,
			user_email: locals.user.email,
			action: 'create',
			target_collection: 'admin_users',
			target_id: email,
			ip_address: getClientAddress()
		});

		return { createSuccess: true, generatedPassword, createdEmail: email };
	},

	toggle: async ({ request, locals, getClientAddress }) => {
		if (locals.user.role !== 'superadmin') {
			return fail(403, { toggleError: 'Accès refusé' });
		}

		const formData = await request.formData();
		const email = formData.get('email')?.toString();
		const action = formData.get('action')?.toString();

		if (!email || (action !== 'activate' && action !== 'deactivate')) {
			return fail(400, { toggleError: 'Paramètres invalides' });
		}

		// Prevent self-deactivation
		if (email === locals.user.email && action === 'deactivate') {
			return fail(400, { toggleError: 'Vous ne pouvez pas désactiver votre propre compte' });
		}

		await toggleAdminUserActive(email, action === 'activate');

		await logAudit({
			user_id: locals.user.email,
			user_email: locals.user.email,
			action: 'update',
			target_collection: 'admin_users',
			target_id: email,
			changes: { is_active: { old: action === 'activate' ? false : true, new: action === 'activate' } },
			ip_address: getClientAddress()
		});

		return { toggleSuccess: true };
	},

	reset: async ({ request, locals, getClientAddress }) => {
		if (locals.user.role !== 'superadmin') {
			return fail(403, { resetError: 'Accès refusé' });
		}

		const formData = await request.formData();
		const email = formData.get('email')?.toString();

		if (!email) {
			return fail(400, { resetError: 'Email requis' });
		}

		const generatedPassword = generatePassword();
		const hash = await hashPassword(generatedPassword);
		await resetAdminPassword(email, hash);

		await logAudit({
			user_id: locals.user.email,
			user_email: locals.user.email,
			action: 'update',
			target_collection: 'admin_users',
			target_id: email,
			changes: { password: { old: '***', new: '***' } },
			ip_address: getClientAddress()
		});

		return { resetSuccess: true, resetPassword: generatedPassword, resetEmail: email };
	},

	permissions: async ({ request, locals, getClientAddress }) => {
		if (locals.user.role !== 'superadmin') {
			return fail(403, { permError: 'Accès refusé' });
		}

		const formData = await request.formData();
		const email = formData.get('email')?.toString();
		const canAdd = formData.get('can_add') === 'on';
		const canEdit = formData.get('can_edit') === 'on';
		const canDelete = formData.get('can_delete') === 'on';

		if (!email) {
			return fail(400, { permError: 'Email requis' });
		}

		await updateAdminPermissions(email, {
			can_add: canAdd,
			can_edit: canEdit,
			can_delete: canDelete
		});

		await logAudit({
			user_id: locals.user.email,
			user_email: locals.user.email,
			action: 'update',
			target_collection: 'admin_users',
			target_id: email,
			changes: { permissions: { old: 'previous', new: { can_add: canAdd, can_edit: canEdit, can_delete: canDelete } } },
			ip_address: getClientAddress()
		});

		return { permSuccess: true, permEmail: email };
	}
};
