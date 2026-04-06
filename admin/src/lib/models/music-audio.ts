import { z } from 'zod';

export const MusicAudioSchema = z.object({
	_id: z.string().optional(),
	book: z.string().nullable(),
	book_full_name: z.string().nullable().optional(),
	number: z.number().nullable(),
	title: z.string().nullable(),
	artist: z.string().nullable(),
	category: z.string(),
	s3_key: z.string(),
	s3_url: z.string().url(),
	file_size: z.number(),
	duration: z.number().nullable().optional(),
	format: z.string(),
	uploaded_at: z.union([z.instanceof(Date), z.string()]).transform((val) => new Date(val)),
	updated_at: z
		.union([z.instanceof(Date), z.string()])
		.transform((val) => new Date(val))
		.nullable()
		.optional(),
	updated_by: z.string().nullable().optional()
});

export type MusicAudio = z.infer<typeof MusicAudioSchema>;

export const CreateMusicAudioSchema = z.object({
	title: z.string().min(1, 'Title is required'),
	artist: z.string().nullable(),
	category: z.string().min(1, 'Category is required'),
	book: z.string().nullable(),
	book_full_name: z.string().nullable(),
	number: z.number().nullable(),
	s3_key: z.string().min(1),
	s3_url: z.string().url(),
	file_size: z.number().positive(),
	duration: z.number().nullable(),
	format: z.string().min(1)
});

export type CreateMusicAudio = z.infer<typeof CreateMusicAudioSchema>;

export const UpdateMusicAudioSchema = z.object({
	title: z.string().min(1, 'Title is required').optional(),
	artist: z.string().nullable().optional(),
	category: z.string().min(1).optional(),
	book: z.string().nullable().optional(),
	book_full_name: z.string().nullable().optional(),
	number: z.number().nullable().optional()
});

export type UpdateMusicAudio = z.infer<typeof UpdateMusicAudioSchema>;
