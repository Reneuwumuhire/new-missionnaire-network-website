import { dev } from '$app/environment';
import { json } from '@sveltejs/kit';
import {
	verifyAuthenticationResponse,
	type AuthenticationResponseJSON,
	type Base64URLString
} from '@simplewebauthn/server';
import { completeLogin, SESSION_COOKIE } from '$lib/server/auth';
import {
	PASSKEY_CHALLENGE_COOKIE,
	createPasskeyAuthenticationOptions,
	passkeyContext
} from '$lib/server/passkeys';
import {
	findAdminByEmail,
	findPasskeyByCredentialId,
	consumePasskeyChallenge,
	createPasskeyChallenge,
	logAudit,
	updatePasskeyCounter
} from '../../../db/collections';
import type { RequestHandler } from './$types';

const challengeCookie = {
	path: '/login/passkey',
	httpOnly: true,
	secure: !dev,
	sameSite: 'strict' as const,
	maxAge: 5 * 60
};

function safeNext(value: unknown): string {
	return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
		? value
		: '/';
}

export const GET: RequestHandler = async ({ cookies, url }) => {
	const options = await createPasskeyAuthenticationOptions(url);
	const challenge = await createPasskeyChallenge(options.challenge, 'authentication');
	cookies.set(PASSKEY_CHALLENGE_COOKIE, challenge.token, challengeCookie);
	return json(options, { headers: { 'cache-control': 'no-store' } });
};

export const POST: RequestHandler = async ({ request, cookies, url, getClientAddress }) => {
	const token = cookies.get(PASSKEY_CHALLENGE_COOKIE);
	cookies.delete(PASSKEY_CHALLENGE_COOKIE, { path: challengeCookie.path });
	const challenge = token ? await consumePasskeyChallenge(token, 'authentication') : null;
	if (!challenge) return json({ error: 'Passkey sign-in expired. Try again.' }, { status: 400 });

	try {
		const body = (await request.json()) as {
			response: AuthenticationResponseJSON;
			next?: string;
		};
		const passkey = await findPasskeyByCredentialId(body.response.id);
		if (!passkey) return json({ error: 'Passkey not recognized.' }, { status: 401 });

		const user = await findAdminByEmail(passkey.user_id);
		if (!user?.is_active) return json({ error: 'Passkey not recognized.' }, { status: 401 });

		const { origin, rpID } = passkeyContext(url);
		const verification = await verifyAuthenticationResponse({
			response: body.response,
			expectedChallenge: challenge.challenge,
			expectedOrigin: origin,
			expectedRPID: rpID,
			credential: {
				id: passkey.credential_id as Base64URLString,
				publicKey: Buffer.from(passkey.public_key, 'base64url'),
				counter: passkey.counter,
				transports: passkey.transports
			},
			requireUserVerification: true
		});
		if (!verification.verified) throw new Error('Passkey verification failed');
		if (
			!(await updatePasskeyCounter(
				passkey.credential_id,
				passkey.counter,
				verification.authenticationInfo.newCounter
			))
		) {
			return json({ error: 'Passkey was already used. Try again.' }, { status: 409 });
		}

		const result = await completeLogin(user, getClientAddress(), request.headers.get('user-agent'));
		cookies.set(SESSION_COOKIE, result.token, {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'lax',
			expires: result.expiresAt
		});
		await logAudit({
			user_id: user._id ?? user.email,
			user_email: user.email,
			action: 'login',
			target_collection: 'admin_users',
			target_id: user._id ?? null,
			changes: {
				authentication: { old: null, new: 'passkey' },
				...(result.isNewDevice ? { security_event: { old: null, new: 'new_device' } } : {})
			},
			ip_address: getClientAddress()
		});

		return json({ verified: true, redirect: safeNext(body.next) });
	} catch {
		return json({ error: 'Passkey sign-in failed. Try again.' }, { status: 401 });
	}
};
