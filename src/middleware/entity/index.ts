import type { z } from "zod";
import type { YoutubeVideoSchema } from "@mnlib/lib/models/youtube";

export type VideoEntity = z.infer<typeof YoutubeVideoSchema>

export type ArgsToGetVideos = {
    videoCount: number,
    startAfter?: number
}