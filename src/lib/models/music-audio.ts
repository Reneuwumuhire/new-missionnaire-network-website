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
	/** Seconds of silent intro to skip on playback start (e.g. tracks ripped
	 *  from YouTube videos with an on-screen title card). Optional; the
	 *  player also has artist-rule fallbacks in src/lib/utils/introSkip.ts. */
	intro_skip_sec: z.number().optional(),
	format: z.string(),
	uploaded_at: z.union([z.instanceof(Date), z.string()]).transform((val) => new Date(val)),
	/** Computed at the API layer (joined from music_lyrics). True when this
	 *  song has a published lyrics doc — drives the small in-list indicator
	 *  next to the title in /musique. Not persisted on music_audio docs. */
	has_lyrics: z.boolean().optional()
});

export type MusicAudio = z.infer<typeof MusicAudioSchema>;
