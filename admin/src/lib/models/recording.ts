import { z } from 'zod';

export const RECORDING_STATUSES = ['recording', 'uploading', 'ready', 'failed'] as const;
export type RecordingStatus = (typeof RECORDING_STATUSES)[number];

export const RecordingSchema = z.object({
	_id: z.string().optional(),
	title: z.string(),
	started_at: z.union([z.instanceof(Date), z.string()]).transform((val) => new Date(val)),
	ended_at: z
		.union([z.instanceof(Date), z.string()])
		.transform((val) => new Date(val))
		.nullable()
		.optional(),
	duration_sec: z.number().nullable().optional(),
	s3_key: z.string().nullable().optional(),
	s3_url: z.string().url().nullable().optional(),
	size_bytes: z.number().nullable().optional(),
	status: z.enum(RECORDING_STATUSES),
	published: z.boolean().default(false),
	created_by: z.string(),
	failure_reason: z.string().nullable().optional(),
	/** Auto-snapshot of broadcast_admin_state.thumbnail_url at recording-save time.
	 *  Lets archive cards show the same thumbnail the live page displayed. */
	thumbnail_url: z.string().url().nullable().optional(),
	/** Auto-snapshot of broadcast_admin_state.description at recording-save time. */
	description: z.string().nullable().optional(),
	updated_at: z
		.union([z.instanceof(Date), z.string()])
		.transform((val) => new Date(val))
		.nullable()
		.optional()
});

export type Recording = z.infer<typeof RecordingSchema>;
