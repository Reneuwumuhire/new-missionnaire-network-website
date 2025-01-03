import z from 'zod';

export const YTVideoThumbNailSchema = z.object({
	url: z.string().url(),
	width: z.number(),
	height: z.number()
});
export type YoutubeVideoThumbNail = z.infer<typeof YTVideoThumbNailSchema>;
export const YTVideoResourceSchema = z.object({
	id: z.string(),
	title: z.string(),
	description: z.string(),
	publishedAt: z.coerce.date(),
	scheduledStartTime: z.coerce.date(),
	thumbNails: z.object({
		default: YTVideoThumbNailSchema,
		medium: YTVideoThumbNailSchema,
		high: YTVideoThumbNailSchema
	})
});
export type YTVideoResource = z.infer<typeof YTVideoResourceSchema>;

export const YtVideoSnippet = z.object({
	publishedAt: z.coerce.date(),
	channelId: z.string(),
	title: z.string(),
	description: z.string(),
	scheduledStartTime: z.coerce.date(),
	thumbnails: z.object({
		default: YTVideoThumbNailSchema,
		medium: YTVideoThumbNailSchema,
		high: YTVideoThumbNailSchema
	})
});

export const YtVideoItemSchema = z.object({
	id: z.object({
		kind: z.string(),
		videoId: z.string()
	}),
	snippet: YtVideoSnippet
});
export const YtSearchResultSchema = z.object({
	pageInfo: z.object({
		totalResults: z.number(),
		resultsPerPage: z.number()
	}),
	nextPageToken: z.string().optional(),
	prevPageToken: z.string().optional(),
	items: z
		.object({
			id: z.object({
				kind: z.string(),
				videoId: z.string()
			}),
			snippet: z.object({
				publishedAt: z.coerce.date(),
				scheduledStartTime: z.coerce.date(),
				channelId: z.string(),
				title: z.string(),
				description: z.string(),
				thumbnails: z.object({
					default: YTVideoThumbNailSchema,
					medium: YTVideoThumbNailSchema,
					high: YTVideoThumbNailSchema
				})
			})
		})
		.array()
});

export type YtSearchResult = z.infer<typeof YtSearchResultSchema>;
export const VideoItemSchema = YtVideoSnippet.extend({
	id: z.string(),
	scheduledStartTime: z.coerce.date()
});
export type VideoItem = z.infer<typeof VideoItemSchema>;
export const SearchVideosResultSchema = z.object({
	resultsPerPage: z.number(),
	prevPageToken: z.string().optional(),
	nextPageToken: z.string().optional(),
	totalResults: z.number(),
	videos: VideoItemSchema.array()
});
export type SearchVideosResult = z.infer<typeof SearchVideosResultSchema>;
