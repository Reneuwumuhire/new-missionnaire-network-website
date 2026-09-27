import { z } from 'zod';

export const SermonLocalizationSchema = z.object({
	title: z.string(),
	audio_url: z.string().url().nullable().optional(),
	pdf_url: z.string().url().nullable().optional(),
	duration: z.number().nullable().optional(),
	source_code: z.string().optional(),
	source_url: z.string().url().optional()
});

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
	duration: z.number().nullable().optional(),
	/** Duration of the English-language audio (english_audio_url), in seconds.
	 *  Stored separately from `duration` (French) because translations usually
	 *  have different runtimes than the original. Populated by the backfill
	 *  script: admin/scripts/backfill-sermon-durations.ts */
	english_duration: z.number().nullable().optional(),
	localizations: z
		.object({
			rw: SermonLocalizationSchema.optional(),
			sw: SermonLocalizationSchema.optional()
		})
		.optional(),
	translations: z.string().array().optional(),
	updated_at: z.string().optional()
});

export type Sermon = z.infer<typeof SermonSchema>;
export type SermonLocalization = z.infer<typeof SermonLocalizationSchema>;
