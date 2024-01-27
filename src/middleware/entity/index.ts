import type { z } from "zod";
import type { YoutubeVideoSchema } from "@mnlib/lib/models/youtube";



export interface ArgsToGetVideos  {
    videoCount: number,
    startAfter?: number
}

export interface ArgsToGetSermonVideos  {
    videoCount: number,
    pageNumber: number,
    type: string[]
}

export interface ArgsToGetAudios {
    audioCount: number,
    startAfter: number
}