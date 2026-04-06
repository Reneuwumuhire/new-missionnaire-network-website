import { fail } from '@sveltejs/kit';
import { verifyPassword, hashPassword } from '$lib/server/auth';
import {
	findAdminByEmail,
	updateAdminProfile,
	updateAdminPassword,
	logAudit
} from '../../db/collections';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	return {
		user: {
			name: locals.user.name,
			email: locals.user.email,
			role: locals.user.role,
			created_at: locals.user.created_at,
			last_login: locals.user.last_login
		}
	};
};

export const actions: Actions = {
	profile: async ({ request, locals, getClientAddress }) => {
		const formData = await request.formData();
		const name = formData.get('name')?.toString()?.trim();

		if (!name || name.length < 2) {
			return fail(400, { profileError: 'Le nom doit contenir au moins 2 caractères', profileSuccess: false });
		}

		try {
			await updateAdminProfile(locals.user.email, { name });

			await logAudit({
				user_id: locals.user.email,
				user_email: locals.user.email,
				action: 'update',
				target_collection: 'admin_users',
				target_id: locals.user._id ?? null,
				changes: { name: { old: locals.user.name, new: name } },
				ip_address: getClientAddress()
			});

			return { profileSuccess: true, profileError: null };
		} catch {
			return fail(500, { profileError: 'Erreur lors de la mise à jour', profileSuccess: false });
		}
	},

	password: async ({ request, locals, getClientAddress }) => {
		const formData = await request.formData();
		const currentPassword = formData.get('currentPassword')?.toString();
		const newPassword = formData.get('newPassword')?.toString();
		const confirmPassword = formData.get('confirmPassword')?.toString();

		if (!currentPassword || !newPassword || !confirmPassword) {
			return fail(400, { passwordError: 'Tous les champs sont requis', passwordSuccess: false });
		}

		if (newPassword.length < 8) {
			return fail(400, { passwordError: 'Le nouveau mot de passe doit contenir au moins 8 caractères', passwordSuccess: false });
		}

		if (newPassword !== confirmPassword) {
			return fail(400, { passwordError: 'Les mots de passe ne correspondent pas', passwordSuccess: false });
		}

		// Verify current password
		const user = await findAdminByEmail(locals.user.email);
		if (!user) {
			return fail(400, { passwordError: 'Utilisateur introuvable', passwordSuccess: false });
		}

		const valid = await verifyPassword(currentPassword, user.password_hash);
		if (!valid) {
			return fail(400, { passwordError: 'Mot de passe actuel incorrect', passwordSuccess: false });
		}

		try {
			const hash = await hashPassword(newPassword);
			await updateAdminPassword(locals.user.email, hash);

			await logAudit({
				user_id: locals.user.email,
				user_email: locals.user.email,
				action: 'update',
				target_collection: 'admin_users',
				target_id: locals.user._id ?? null,
				changes: { password: { old: '***', new: '***' } },
				ip_address: getClientAddress()
			});

			return { passwordSuccess: true, passwordError: null };
		} catch {
			return fail(500, { passwordError: 'Erreur lors de la mise à jour', passwordSuccess: false });
		}
	}
};
