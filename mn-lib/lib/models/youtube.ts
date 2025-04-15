import { z } from 'zod';
import { AudioAssetSchema, TextAssetSchema } from './media-assets';

export const SONG_VIDEO_MAX_DURATION = 60 * 15;

export const ThumbnailSchema = z.object({
	url: z.string().url(),
	width: z.number(),
	height: z.number()
});

export const NewYoutubeVideoSchema = z.object({
	definition: z.enum(['hd', 'sd']),
	duration: z.string(),
	durationInSeconds: z.number(),
	id: z.string(),
	publishedAt: z.coerce.date(),
	channelId: z.coerce.string(),
	title: z.coerce.string(),
	description: z.coerce.string(),
	thumbnails: z.object({
		default: ThumbnailSchema,
		medium: ThumbnailSchema,
		high: ThumbnailSchema,
		standard: ThumbnailSchema
	}),
	channelTitle: z.string(),
	liveBroadcastContent: z.enum(['upcoming', 'none']),
	uploadStatus: z.enum(['processed', 'uploaded']),
	privacyStatus: z.enum(['private', 'public', 'unlisted']),
	embeddable: z.boolean(),
	publicStatsViewable: z.boolean(),
	actualStartTime: z.coerce.date().optional(),
	actualEndTime: z.coerce.date().optional(),
	scheduledStartTime: z.coerce.date().optional(),
	audios: AudioAssetSchema.array().default([]).nullable().optional(),
	transcription: TextAssetSchema.nullable().default(null)
});
export type NewYoutubeVideo = z.infer<typeof NewYoutubeVideoSchema>;
export const YoutubeVideoTagSchema = z.enum([
	'branham',
	'william',
	'ewald',
	'frank',
	'local',
	'song',
	'any',
	'predication',
	'retransmission',
	'ibaruwa',
	'lettre',
	'circulaire'
]);
export type YoutubeVideoTag = z.infer<typeof YoutubeVideoTagSchema>;

export const YoutubeVideoSchema = z.object({
	_id: z.string(),
	id: z.string(),
	title: z.string(),
	thumbnails: z.array(z.unknown()), // You might want to define a more specific schema for thumbnails
	thumbnail: z.string().url(),
	description: z.string(),
	duration: z.number(),
	view_count: z.number(),
	webpage_url: z.string().url(),
	tags: z.array(z.string()),
	live_status: z.string(),
	release_timestamp: z.number(),
	upload_date: z.string(),
	timestamp: z.number(),
	availability: z.string(),
	original_url: z.string().url(),
	display_id: z.string(),
	fulltitle: z.string(),
	duration_string: z.string(),
	release_year: z.number(),
	epoch: z.number(),
	aspect_ratio: z.number(),
	pdfInfo: z.array(
		z.object({
			url: z.string().url(),
			size: z.number(),
			fileName: z.string(),
			s3Key: z.string()
		})
	)
});
export const YoutubeAudioSchema = YoutubeVideoSchema.extend({
	audioFiles: z.object({
		default: z.object({
			url: z.string().url(),
			fileName: z.string(),
			durationInSec: z.number()
		})
	})
});
export type YoutubeAudio = z.infer<typeof YoutubeAudioSchema>;

export type YoutubeVideo = z.infer<typeof YoutubeVideoSchema>;
