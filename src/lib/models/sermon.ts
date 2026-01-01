import { z } from 'zod';

export const SermonSchema = z.object({
	_id: z.string().optional(),
	full_date_code: z.string(),
	author: z.string(),
	date_code: z.string(),
	english_title: z.string().optional(),
	french_title: z.string().optional(),
	english_audio_url: z.string().url().nullable().optional(),
	english_pdf_url: z.string().url().nullable().optional(),
	iso_date: z.string().nullable().optional(),
	mp3_url: z.string().url().nullable().optional(),
	pdf_url: z.string().url().nullable().optional(),
	translations: z.string().array().optional(),
	updated_at: z.string().optional()
});

export type Sermon = z.infer<typeof SermonSchema>;
