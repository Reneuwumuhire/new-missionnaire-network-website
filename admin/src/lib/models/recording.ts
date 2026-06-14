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
	created_by_name: z.string().nullable().optional(),
	failure_reason: z.string().nullable().optional(),
	/** Auto-snapshot of broadcast_admin_state.thumbnail_url at recording-save time.
	 *  Lets archive cards show the same thumbnail the live page displayed. */
	thumbnail_url: z.string().url().nullable().optional(),
	/** S3 key for the thumbnail — used to delete the old object when replacing. */
	thumbnail_s3_key: z.string().nullable().optional(),
	/** Auto-snapshot of broadcast_admin_state.description at recording-save time. */
	description: z.string().nullable().optional(),
	/** Precomputed mono waveform peaks (0..1 magnitude, ~4000 bins). Generated
	 *  by the recorder service at upload time and refreshed whenever the MP3
	 *  is replaced or trimmed. Lets the admin editor render the waveform
	 *  instantly without re-downloading and decoding the full MP3. */
	peaks: z.array(z.number()).nullable().optional(),
	peaks_duration_sec: z.number().nullable().optional(),
	/** Optional French-language audio version. The primary `s3_*` audio is the
	 *  original broadcast capture (often a local language for retransmissions);
	 *  when a French dub is attached here, listeners can switch to it on the
	 *  replay page. */
	french_audio_s3_key: z.string().nullable().optional(),
	french_audio_s3_url: z.string().url().nullable().optional(),
	french_audio_size_bytes: z.number().nullable().optional(),
	french_audio_duration_sec: z.number().nullable().optional(),
	/** Language code of the primary/original audio (e.g. 'rw' Kinyarwanda).
	 *  Labels the original option in the replay language switch. */
	original_audio_language: z.string().nullable().optional(),
	/** YouTube video id (e.g. "MgoAxBWkG-s") linking this recording to the
	 *  corresponding VOD on our channel. Lets the public audio detail page
	 *  surface a YouTube link + pull the transcription PDF associated with
	 *  that video. Admin-editable. */
	source_video_id: z.string().nullable().optional(),
	/** Preferred PDF transcription attached to this recording. Usually this is
	 *  auto-filled from an already-uploaded PDF on the linked YouTube video. */
	transcript_pdf_id: z.string().nullable().optional(),
	/** Replay subtitles attached directly to this recording (independent of the
	 *  scheduled-live source). When set, the public replay uses these instead of
	 *  the scheduled-live anchor-derived subtitles. */
	subtitle_srt_url: z.string().url().nullable().optional(),
	subtitle_srt_s3_key: z.string().nullable().optional(),
	subtitle_filename: z.string().nullable().optional(),
	/** Milliseconds into the recording at which SRT 00:00 occurs (sync point).
	 *  May be negative if the subtitles lead the audio. */
	subtitle_offset_into_recording_ms: z.number().nullable().optional(),
	/** Admin kill-switch: hide subtitles from listeners without deleting the
	 *  file (e.g. while a bad SRT is being corrected). */
	subtitles_hidden: z.boolean().optional(),
	updated_at: z
		.union([z.instanceof(Date), z.string()])
		.transform((val) => new Date(val))
		.nullable()
		.optional()
});

export type Recording = z.infer<typeof RecordingSchema>;
