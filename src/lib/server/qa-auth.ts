import { createHash, randomBytes } from 'crypto';
import type { Cookies } from '@sveltejs/kit';
import { getDb } from '../../db/mongo';

export const ADMIN_SESSION_COOKIE = 'admin_session';
export const QA_GUEST_COOKIE = 'qa_guest';

export interface QaUser {
	id: string;
	email: string;
	name: string;
	role: 'superadmin' | 'editor' | 'guest';
	isGuest?: boolean;
}

export function canModerateQuestions(user: QaUser | null): boolean {
	return Boolean(user && !user.isGuest);
}

export function canPublishOfficialAnswer(user: QaUser | null): boolean {
	return user?.role === 'superadmin';
}

export function createAnonymousQaDisplayName(): string {
	const suffix = 1000 + (randomBytes(2).readUInt16BE(0) % 9000);
	return `Visiteur ${suffix}`;
}

export function resolveQaDisplayName(value: unknown, fallback?: string | null): string {
	const submitted = typeof value === 'string' ? value.trim() : '';
	if (submitted) return submitted;

	const savedName = typeof fallback === 'string' ? fallback.trim() : '';
	return savedName || createAnonymousQaDisplayName();
}

function hashGuestToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

function guestCookieOptions() {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: process.env.NODE_ENV === 'production',
		maxAge: 60 * 60 * 24 * 365
	};
}

function guestUserFromDoc(doc: { authorId?: unknown; displayName?: unknown }): QaUser | null {
	const authorId = String(doc.authorId || '');
	if (!authorId) return null;
	return {
		id: authorId,
		email: authorId,
		name: String(doc.displayName || 'Visiteur'),
		role: 'guest',
		isGuest: true
	};
}

async function getGuestUserFromToken(token: string | undefined): Promise<QaUser | null> {
	if (!token || token.length < 24) return null;

	const db = await getDb();
	const tokenHash = hashGuestToken(token);
	const guest = await db.collection('questionGuests').findOne({ tokenHash });
	if (!guest) return null;

	await db.collection('questionGuests').updateOne({ _id: guest._id }, { $set: { lastSeenAt: new Date() } });
	return guestUserFromDoc({ authorId: guest.authorId, displayName: guest.displayName });
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
		id: email,
		email,
		name: String(user.name || email),
		role
	};
}

export async function getCurrentQaUser(cookies: Cookies): Promise<QaUser | null> {
	const adminUser = await getQaUserFromToken(cookies.get(ADMIN_SESSION_COOKIE));
	if (adminUser) return adminUser;
	return getGuestUserFromToken(cookies.get(QA_GUEST_COOKIE));
}

export async function ensurePublicQaUser(cookies: Cookies, displayName: string): Promise<QaUser> {
	const adminUser = await getQaUserFromToken(cookies.get(ADMIN_SESSION_COOKIE));
	if (adminUser) return adminUser;

	const db = await getDb();
	const existingToken = cookies.get(QA_GUEST_COOKIE);
	const existingHash = existingToken ? hashGuestToken(existingToken) : null;
	const existingGuest = existingHash ? await db.collection('questionGuests').findOne({ tokenHash: existingHash }) : null;
	const now = new Date();

	if (existingGuest) {
		await db.collection('questionGuests').updateOne(
			{ _id: existingGuest._id },
			{ $set: { displayName, updatedAt: now, lastSeenAt: now } }
		);
		return {
			id: String(existingGuest.authorId),
			email: String(existingGuest.authorId),
			name: displayName,
			role: 'guest',
			isGuest: true
		};
	}

	const token = randomBytes(32).toString('base64url');
	const tokenHash = hashGuestToken(token);
	const authorId = `guest:${tokenHash.slice(0, 32)}`;
	await db.collection('questionGuests').createIndex({ tokenHash: 1 }, { unique: true });
	await db.collection('questionGuests').createIndex({ authorId: 1 }, { unique: true });
	await db.collection('questionGuests').insertOne({
		tokenHash,
		authorId,
		displayName,
		createdAt: now,
		updatedAt: now,
		lastSeenAt: now
	});
	cookies.set(QA_GUEST_COOKIE, token, guestCookieOptions());

	return {
		id: authorId,
		email: authorId,
		name: displayName,
		role: 'guest',
		isGuest: true
	};
}
