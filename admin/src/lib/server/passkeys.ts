import { createHash } from 'node:crypto';
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	type Base64URLString
} from '@simplewebauthn/server';
import type { AdminUser } from '$lib/models/admin-user';

export const PASSKEY_CHALLENGE_COOKIE = 'admin_passkey_challenge';

export function passkeyContext(url: URL): { origin: string; rpID: string } {
	return { origin: url.origin, rpID: url.hostname };
}

export function passkeyUserId(email: string): Uint8Array<ArrayBuffer> {
	return Uint8Array.from(createHash('sha256').update(email.toLowerCase()).digest());
}

export function createPasskeyRegistrationOptions(
	url: URL,
	user: AdminUser,
	existingCredentialIds: string[]
) {
	const { rpID } = passkeyContext(url);
	return generateRegistrationOptions({
		rpName: 'Missionnaire Admin',
		rpID,
		userID: passkeyUserId(user.email),
		userName: user.email,
		userDisplayName: user.name || user.email,
		attestationType: 'none',
		excludeCredentials: existingCredentialIds.map((id) => ({ id: id as Base64URLString })),
		authenticatorSelection: {
			authenticatorAttachment: 'platform',
			residentKey: 'required',
			userVerification: 'required'
		},
		preferredAuthenticatorType: 'localDevice'
	});
}

export function createPasskeyAuthenticationOptions(url: URL) {
	return generateAuthenticationOptions({
		rpID: passkeyContext(url).rpID,
		userVerification: 'required'
	});
}
