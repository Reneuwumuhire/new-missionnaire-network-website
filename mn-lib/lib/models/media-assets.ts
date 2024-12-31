import { Timestamp } from "@google-cloud/firestore";
import { z } from "zod";
export const LanguageSchema = z.enum(["kinyarwanda", "english", "francais"]);

export const ThumbnailSchema = z.object({
	url: z.string().url(),
	width: z.number(),
	height: z.number()
});

export const TimestampType = z.custom<Timestamp | Date>((value) => {
	if (!(value instanceof Timestamp) && !(value instanceof Date)) {
		throw new Error("invalid Timestamp");
	}
	return true;

}).transform((value) => {
	if (value instanceof Timestamp) {
		return value.toDate()
	}
	return value;
});
export const AssetSchema = z.object({
	fileName: z.string(),
	type: z.string(),
	size: z.number(),
	url: z.string().url(),
	thumbnails: z.object({
		default: ThumbnailSchema,
		medium: ThumbnailSchema.optional(),
		high: ThumbnailSchema.optional(),
		standard: ThumbnailSchema.optional(),
	}),
	languages: LanguageSchema.array(),
	description: z.string(),
	shortDescription: z.string(),
	author: z.string().nullable().default(null).optional(),
	path: z.string(),
	releaseDate: TimestampType.optional()
});

export const AssetTagSchema = z.enum([
	"branham",
	"william",
	"ewald",
	"frank",
	"local",
	"song",
	"any",
	"predication",
	"retransmission",
	"ibaruwa",
	"lettre",
	"circulaire",
	"book",
	"audio"
]);

export const AudioVersionSchema = z.object({
	versionName: z.enum(["LQ", "HQ"]),
	sampleRate: z.number(),
	waveform: z.number().array(),
	url: z.string().url(),
	fileName: z.string()
});
export type AudioVersion = z.infer<typeof AudioVersionSchema>;

export const AudioAssetSchema = AssetSchema.extend({
	duration: z.number(),
	sampleRate: z.number(),
	title: z.string(),
	waveform: z.number().array(),
	tags: AssetTagSchema.array(),
	transcription: AssetSchema.nullable().default(null),
	video: AssetSchema.nullable().default(null),
	versions: z.object({
		LQ: AudioVersionSchema.optional(),
		HQ: AudioVersionSchema.optional()
	}).default({})

});

export type AudioAsset = z.infer<typeof AudioAssetSchema>;

export const TextAssetSchema = AssetSchema.extend({
	pages: z.number(),
	title: z.string(),
	tags: AssetTagSchema.array(),
	languages: z.string().array(),
	audio: AssetSchema.nullable(),
	video: AssetSchema.nullable()
});

export type TextAsset = z.infer<typeof TextAssetSchema>;



export const NewLoadedTextAssetSchema = z.object({
	pages: z.number(),
	fileName: z.string(),
	type: z.string(),
	size: z.number(),
	shortDescription: z.string(),
	languages: LanguageSchema.array(),
	author: z.string().nullable().optional().default(null),
	thumbnails: z.object({
		default: ThumbnailSchema,
		medium: ThumbnailSchema.optional(),
		high: ThumbnailSchema.optional(),
		standard: ThumbnailSchema.optional(),
	}),
});

export type NewLoadedTextAsset = z.infer<typeof NewLoadedTextAssetSchema>;

export const NewLoadedAudioAssetSchema = z.object({
	fileName: z.string(),
	type: z.string(),
	size: z.number(),
	duration: z.number(),
	sampleRate: z.number(),
	waveform: z.number().array(),
	shortDescription: z.string(),
	languages: LanguageSchema.array(),
	author: z.string().nullable().optional()
});

export type NewLoadedAudioAsset = z.infer<typeof NewLoadedAudioAssetSchema>;

export const NewVideoAudioAssetSchema = NewLoadedAudioAssetSchema.extend({
	url: z.string().url()
});

export type NewVideoAudioAsset = z.infer<typeof NewVideoAudioAssetSchema>;
