import { z } from 'zod';

export const AdminSessionSchema = z.object({
	_id: z.string().optional(),
	user_id: z.string(),
	token: z.string(),
	created_at: z.union([z.instanceof(Date), z.string()]).transform((val) => new Date(val)),
	expires_at: z.union([z.instanceof(Date), z.string()]).transform((val) => new Date(val)),
	ip_address: z.string().nullable(),
	user_agent: z.string().nullable()
});

export type AdminSession = z.infer<typeof AdminSessionSchema>;
