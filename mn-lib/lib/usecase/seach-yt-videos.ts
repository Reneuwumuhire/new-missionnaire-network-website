import type { Usecase, Result } from "./usecase";
import YoutubeVideosRepo from "../repository/youtube-videos";
import { YoutubeVideoTagSchema, type YoutubeVideo } from "../models/youtube";
import { z } from "zod";

export const UsecaseArgsSchema = z.object({
    searchTags: YoutubeVideoTagSchema.array(),
    limit: z.number(),
    pageNumber: z.number(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional()
});

export type UsecaseArgs = z.infer<typeof UsecaseArgsSchema>;

export default class SearchYtVideosUsecase implements Usecase<YoutubeVideo[], UsecaseArgs>{
    constructor(private readonly ytRepository = new YoutubeVideosRepo()) { }
    async execute(usecaseArgs: UsecaseArgs) {

        try {
            const videos = await this.ytRepository.queryVideos(usecaseArgs);
            const result: Result<YoutubeVideo[]> = {
                ok: true,
                value: videos as any
            }
            return result;
        } catch (e) {
            const message = e instanceof Error ? e.message : `error searching youtube videos`;
            const error: Result<YoutubeVideo[]> = {
                ok: false,
                error: new Error(message)
            }
            return error;
        }
    }

}
