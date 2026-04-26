import { getDb } from '../../db/mongo';

export const ADMIN_SESSION_COOKIE = 'admin_session';

export interface QaUser {
	id: string;
	email: string;
	name: string;
	role: 'superadmin' | 'editor';
}

export function canModerateQuestions(user: QaUser | null): boolean {
	return Boolean(user);
}

export function canPublishOfficialAnswer(user: QaUser | null): boolean {
	return user?.role === 'superadmin';
}

export async function getQaUserFromToken(token: string | undefined): Promise<QaUser | null> {
	if (!token) return null;

	const db = await getDb();
	const session = await db.collection('admin_sessions').findOne({ token });
	if (!session) return null;

	const expiresAt = new Date(session.expires_at as Date | string);
	if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) return null;

	const email = String(session.user_id || '').toLowerCase();
	if (!email) return null;

	const user = await db.collection('admin_users').findOne({ email, is_active: true });
	if (!user) return null;

	const role = user.role === 'superadmin' ? 'superadmin' : 'editor';
	return {
		id: (user._id?.toString?.() as string | undefined) ?? email,
		email,
		name: String(user.name || email),
		role
	};
}
