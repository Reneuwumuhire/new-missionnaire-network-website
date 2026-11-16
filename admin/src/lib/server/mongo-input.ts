import { z } from 'zod';

export const objectIdString = z.string().regex(/^[a-f\d]{24}$/i);
export const adminEmail = z
	.email()
	.max(254)
	.transform((email) => email.toLowerCase());
