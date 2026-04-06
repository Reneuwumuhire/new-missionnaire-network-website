import { z } from 'zod';

export const AuditActionSchema = z.enum([
	'create',
	'update',
	'delete',
	'bulk_delete',
	'bulk_update',
	'login',
	'logout'
]);

export type AuditAction = z.infer<typeof AuditActionSchema>;

export const AuditLogSchema = z.object({
	_id: z.string().optional(),
	user_id: z.string(),
	user_email: z.string(),
	action: AuditActionSchema,
	target_collection: z.string(),
	target_id: z.string().nullable(),
	target_ids: z.array(z.string()).nullable(),
	changes: z.record(z.object({ old: z.unknown(), new: z.unknown() })).nullable(),
	timestamp: z.union([z.instanceof(Date), z.string()]).transform((val) => new Date(val)),
	ip_address: z.string().nullable()
});

export type AuditLog = z.infer<typeof AuditLogSchema>;
