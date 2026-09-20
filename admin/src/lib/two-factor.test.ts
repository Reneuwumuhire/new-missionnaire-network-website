import assert from 'node:assert/strict';
import test from 'node:test';
import {
	decryptTwoFactorSecret,
	encodeBase32,
	encryptTwoFactorSecret,
	hashRecoveryCode,
	totpCode,
	verifyTotp
} from './two-factor';

test('generates and verifies the RFC 6238 SHA-1 code', () => {
	const secret = encodeBase32(Buffer.from('12345678901234567890'));
	assert.equal(totpCode(secret, 59_000), '287082');
	assert.equal(verifyTotp(secret, '287082', 59_000), true);
	assert.equal(verifyTotp(secret, '000000', 59_000), false);
});

test('accepts a code from the adjacent clock window', () => {
	const secret = encodeBase32(Buffer.from('12345678901234567890'));
	assert.equal(verifyTotp(secret, totpCode(secret, 30_000), 60_000), true);
});

test('encrypts secrets and rejects the wrong key', () => {
	const encrypted = encryptTwoFactorSecret('JBSWY3DPEHPK3PXP', 'a secure deployment key');
	assert.equal(decryptTwoFactorSecret(encrypted, 'a secure deployment key'), 'JBSWY3DPEHPK3PXP');
	assert.throws(() => decryptTwoFactorSecret(encrypted, 'wrong key'));
});

test('normalizes recovery codes before hashing', () => {
	assert.equal(hashRecoveryCode('ABCDE-12345', 'key'), hashRecoveryCode('abcde12345', 'key'));
});
