import type { z } from "zod";
import type { YoutubeVideoSchema } from "@mnlib/lib/models/youtube";



export interface ArgsToGetVideos  {
    videoCount: number,
    startAfter?: number
}

export interface ArgsToGetAudios {
    audioCount: number,
    startAfter: number
}