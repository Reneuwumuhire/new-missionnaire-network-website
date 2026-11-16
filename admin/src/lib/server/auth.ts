import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import {
	findAdminByEmail,
	createSessionRecord,
	findSession,
	deleteSession,
	updateLastLogin,
	hasKnownSessionDevice,
	deleteOtherSessionsForUser,
	deleteAllSessionsForUser
} from '../../db/collections';
import type { AdminUser } from '$lib/models/admin-user';

const SALT_ROUNDS = 12;
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function hashPassword(plain: string): Promise<string> {
	return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
	return bcrypt.compare(plain, hash);
}

export async function createSession(
	userId: string,
	ip: string | null,
	userAgent: string | null
): Promise<{ token: string; expiresAt: Date; isNewDevice: boolean }> {
	const token = randomUUID();
	const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
	const isNewDevice = !(await hasKnownSessionDevice(userId, userAgent));

	await createSessionRecord({
		user_id: userId,
		token,
		expires_at: expiresAt,
		ip_address: ip,
		user_agent: userAgent,
		is_new_device: isNewDevice
	});

	return { token, expiresAt, isNewDevice };
}

export async function validateSession(token: string): Promise<AdminUser | null> {
	const session = await findSession(token);
	if (!session) return null;

	const expiresAt = new Date(session.expires_at).getTime();
	if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
		await deleteSession(token);
		return null;
	}

	const user = await findAdminByEmail(session.user_id);
	if (!user?.is_active || (user.role !== 'superadmin' && user.role !== 'editor')) return null;
	return user;
}

export async function authenticatePassword(
	email: string,
	password: string
): Promise<AdminUser | null> {
	const user = await findAdminByEmail(email);
	if (!user || !user.is_active) return null;
	return (await verifyPassword(password, user.password_hash)) ? user : null;
}

export async function completeLogin(
	user: AdminUser,
	ip: string | null,
	userAgent: string | null
): Promise<{ user: AdminUser; token: string; expiresAt: Date; isNewDevice: boolean }> {
	const { token, expiresAt, isNewDevice } = await createSession(user.email, ip, userAgent);
	if (user._id) await updateLastLogin(user._id);

	return { user, token, expiresAt, isNewDevice };
}

export async function login(
	email: string,
	password: string,
	ip: string | null,
	userAgent: string | null
): Promise<{ user: AdminUser; token: string; expiresAt: Date; isNewDevice: boolean } | null> {
	const user = await authenticatePassword(email, password);
	return user ? completeLogin(user, ip, userAgent) : null;
}

export async function logout(token: string): Promise<void> {
	await deleteSession(token);
}

export async function revokeOtherSessions(userId: string, currentToken: string): Promise<number> {
	const tokens = await deleteOtherSessionsForUser(userId, currentToken);
	return tokens.length;
}

export async function revokeAllSessions(userId: string): Promise<number> {
	const tokens = await deleteAllSessionsForUser(userId);
	return tokens.length;
}

export const SESSION_COOKIE = 'admin_session';
