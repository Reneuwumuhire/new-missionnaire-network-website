import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import {
	findAdminByEmail,
	createSessionRecord,
	findSession,
	deleteSession,
	updateLastLogin
} from '../../db/collections';
import type { AdminUser } from '$lib/models/admin-user';

const SALT_ROUNDS = 12;
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Per-process cache of validated sessions. The hooks.server.ts handler runs on
// every page navigation, asset request and API call — without this each one
// would issue two separate MongoDB queries (session lookup + user lookup).
// 15s is short enough that deactivation/role changes propagate quickly and
// long enough to absorb the burst of requests that follow a single navigation.
const SESSION_CACHE_TTL_MS = 15_000;
const sessionCache = new Map<string, { user: AdminUser; cachedAt: number }>();

export function invalidateSessionCache(token: string): void {
	sessionCache.delete(token);
}

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
): Promise<{ token: string; expiresAt: Date }> {
	const token = randomUUID();
	const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

	await createSessionRecord({
		user_id: userId,
		token,
		expires_at: expiresAt,
		ip_address: ip,
		user_agent: userAgent
	});

	return { token, expiresAt };
}

export async function validateSession(token: string): Promise<AdminUser | null> {
	const cached = sessionCache.get(token);
	if (cached && Date.now() - cached.cachedAt < SESSION_CACHE_TTL_MS) {
		return cached.user;
	}

	const session = await findSession(token);
	if (!session) {
		sessionCache.delete(token);
		return null;
	}

	const expiresAt = new Date(session.expires_at);
	if (expiresAt < new Date()) {
		await deleteSession(token);
		sessionCache.delete(token);
		return null;
	}

	const user = await findAdminByEmail(session.user_id);
	if (!user || !user.is_active) {
		sessionCache.delete(token);
		return null;
	}

	sessionCache.set(token, { user, cachedAt: Date.now() });
	return user;
}

export async function login(
	email: string,
	password: string,
	ip: string | null,
	userAgent: string | null
): Promise<{ user: AdminUser; token: string; expiresAt: Date } | null> {
	const user = await findAdminByEmail(email);
	if (!user || !user.is_active) return null;

	const valid = await verifyPassword(password, user.password_hash);
	if (!valid) return null;

	const { token, expiresAt } = await createSession(user.email, ip, userAgent);
	if (user._id) await updateLastLogin(user._id);

	return { user, token, expiresAt };
}

export async function logout(token: string): Promise<void> {
	sessionCache.delete(token);
	await deleteSession(token);
}

export const SESSION_COOKIE = 'admin_session';
