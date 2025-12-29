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
	uploaded_at: z.union([z.instanceof(Date), z.string()]).transform((val) => new Date(val))
});

export type MusicAudio = z.infer<typeof MusicAudioSchema>;
