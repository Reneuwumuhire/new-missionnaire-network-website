import { verifyAdminSession } from '$lib/server/admin-session';
import { dev } from '$app/env';
import { json } from '@sveltejs/kit';
import { verifyRegistrationResponse, type RegistrationResponseJSON } from '@simplewebauthn/server';
import { verifyPassword } from '$lib/server/auth';
import {
	PASSKEY_CHALLENGE_COOKIE,
	createPasskeyRegistrationOptions,
	passkeyContext
} from '$lib/server/passkeys';
import {
	consumePasskeyChallenge,
	createPasskey,
	createPasskeyChallenge,
	listPasskeysForUser,
	logAudit
} from '../../../../db/collections';
import type { RequestHandler } from './$types';

const cookieOptions = {
	path: '/api/passkeys/register',
	httpOnly: true,
	secure: !dev,
	sameSite: 'strict' as const,
	maxAge: 5 * 60
};

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const adminUser = await verifyAdminSession(cookies);
	if (adminUser.must_change_password) {
		return json({ error: 'Change your temporary password first.' }, { status: 409 });
	}

	const { currentPassword } = (await request.json().catch(() => ({}))) as {
		currentPassword?: string;
	};
	if (!currentPassword || !(await verifyPassword(currentPassword, adminUser.password_hash))) {
		return json({ error: 'Current password is incorrect.' }, { status: 401 });
	}

	const existing = await listPasskeysForUser(adminUser.email);
	const options = await createPasskeyRegistrationOptions(
		url,
		adminUser,
		existing.map((passkey) => passkey.credential_id)
	);
	const challenge = await createPasskeyChallenge(
		options.challenge,
		'registration',
		adminUser.email
	);
	cookies.set(PASSKEY_CHALLENGE_COOKIE, challenge.token, cookieOptions);
	return json(options, { headers: { 'cache-control': 'no-store' } });
};

export const PUT: RequestHandler = async ({ request, cookies, url, getClientAddress }) => {
	const adminUser = await verifyAdminSession(cookies);
	const token = cookies.get(PASSKEY_CHALLENGE_COOKIE);
	cookies.delete(PASSKEY_CHALLENGE_COOKIE, { path: cookieOptions.path });
	const challenge = token
		? await consumePasskeyChallenge(token, 'registration', adminUser.email)
		: null;
	if (!challenge) return json({ error: 'Passkey setup expired. Try again.' }, { status: 400 });

	try {
		const response = (await request.json()) as RegistrationResponseJSON;
		const { origin, rpID } = passkeyContext(url);
		const verification = await verifyRegistrationResponse({
			response,
			expectedChallenge: challenge.challenge,
			expectedOrigin: origin,
			expectedRPID: rpID,
			requireUserVerification: true
		});
		if (!verification.verified) throw new Error('Passkey verification failed');

		const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
		await createPasskey({
			user_id: adminUser.email,
			credential_id: credential.id,
			public_key: Buffer.from(credential.publicKey).toString('base64url'),
			counter: credential.counter,
			transports: credential.transports,
			device_type: credentialDeviceType,
			backed_up: credentialBackedUp
		});
		await logAudit({
			user_id: adminUser._id ?? adminUser.email,
			user_email: adminUser.email,
			action: 'create',
			target_collection: 'admin_passkeys',
			target_id: credential.id,
			ip_address: getClientAddress()
		});
		return json({ verified: true });
	} catch {
		return json({ error: 'Passkey verification failed. Try again.' }, { status: 400 });
	}
};
