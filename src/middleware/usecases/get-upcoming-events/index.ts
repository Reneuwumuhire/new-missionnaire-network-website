import { Result } from "@badrap/result";
import type { UseCase } from "..";
import { InternalFailure } from "../../errors/failures";
import resolver from "../../repository/resolver";
import { z } from "zod";
import { URLInstance } from "../../repository/repo";
import { YoutubeVideoSchema, type YoutubeVideo } from "@mnlib/lib/models/youtube";

export default class GetUpcomingEventsUsecase implements UseCase<void, YoutubeVideo[]>{
    async execute(): Promise<Result<YoutubeVideo[], InternalFailure>> {
        try {
            const url = URLInstance;
            url.pathname = `/api/yt/upcoming`;
            const res = await resolver(url, "GET", undefined, z.array(YoutubeVideoSchema));

            if (res.isOk) {
                return Result.ok(res.value)
            }
            else throw new Error(res.error.message);
        } catch (error) {
            return Result.err(new InternalFailure("Failed to get upcoming events from server"));
        }
    }
}