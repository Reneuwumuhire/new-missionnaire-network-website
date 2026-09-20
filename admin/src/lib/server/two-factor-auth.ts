import { env } from '$env/dynamic/private';
import type { AdminUser } from '$lib/models/admin-user';
import { decryptTwoFactorSecret, hashRecoveryCode, verifyTotp } from '$lib/two-factor';
import { consumeRecoveryCode } from '../../db/collections';

export const TWO_FACTOR_CHALLENGE_COOKIE = 'admin_2fa_challenge';

export function twoFactorKey(): string | null {
	const key = env.ADMIN_2FA_ENCRYPTION_KEY?.trim();
	return key && key.length >= 32 ? key : null;
}

export async function verifySecondFactor(user: AdminUser, code: string): Promise<boolean> {
	const key = twoFactorKey();
	if (!key || !user.two_factor_secret) return false;

	try {
		const secret = decryptTwoFactorSecret(user.two_factor_secret, key);
		if (verifyTotp(secret, code)) return true;
	} catch {
		return false;
	}

	const recoveryHash = hashRecoveryCode(code, key);
	return consumeRecoveryCode(user.email, recoveryHash);
}
