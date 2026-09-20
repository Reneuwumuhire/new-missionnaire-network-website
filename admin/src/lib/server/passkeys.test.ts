import assert from 'node:assert/strict';
import test from 'node:test';
import {
	createPasskeyAuthenticationOptions,
	createPasskeyRegistrationOptions,
	passkeyUserId
} from './passkeys';

const user = {
	email: 'admin@example.com',
	name: 'Admin',
	password_hash: 'unused',
	role: 'superadmin' as const,
	created_at: new Date(),
	last_login: null,
	is_active: true,
	must_change_password: false,
	two_factor_enabled: false,
	recovery_code_hashes: []
};

test('passkey options require discoverable user verification for the current host', async () => {
	const url = new URL('http://localhost:5173/settings');
	const registration = await createPasskeyRegistrationOptions(url, user, []);
	const authentication = await createPasskeyAuthenticationOptions(url);

	assert.equal(registration.rp.id, 'localhost');
	assert.equal(registration.authenticatorSelection?.residentKey, 'required');
	assert.equal(registration.authenticatorSelection?.userVerification, 'required');
	assert.equal(authentication.rpId, 'localhost');
	assert.equal(authentication.userVerification, 'required');
	assert.deepEqual(passkeyUserId('ADMIN@example.com'), passkeyUserId('admin@example.com'));
});
