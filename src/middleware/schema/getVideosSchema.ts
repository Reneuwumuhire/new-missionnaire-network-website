
import { z } from "zod";

export const VideoSchema = z.object(
    {
        id: z.string(),
        publishedAt: z.string(),
        channelId:  z.string(),
        title:  z.string(),
        description:  z.string(),
        thumbnails: z.object({
            default: z.object({
                url: z.string(),
                width: z.number(),
                height: z.number()
              }),
            medium: z.object({
                url: z.string(),
                width: z.number(),
                height: z.number()
              }),
            high: z.object({
                url: z.string(),
                width: z.number(),
                height: z.number()
              })
          })
      }
)

export const VideosResSchema = z.object({
    resultsPerPage: z.number(),
    nextPageToken: z.string(),
    totalResults: z.number(),
    videos: z.array(VideoSchema)
})