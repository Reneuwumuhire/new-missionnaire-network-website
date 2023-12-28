import { Result } from "@badrap/result";
import type { UseCase } from "..";
import { InternalFailure } from "../../errors/failures";
import resolver from "../../repository/resolver";
import { z } from "zod";
import { URLInstance } from "../../repository/repo";
import { VideosResSchema } from "../../schema/getVideosSchema";
import type { VideoEntity } from "../../entity";
import { YoutubeVideoSchema } from "@mnlib/lib/models/youtube";

export default class GetCurrentLiveStreamingEventsUsecase implements UseCase<void, VideoEntity|null>{
    async execute(): Promise<Result<VideoEntity|null, InternalFailure>> {
        try {
            const url = URLInstance;
            url.pathname = `/api/yt/livestream`;
            const res = await resolver(url, "GET", undefined, z.array(YoutubeVideoSchema));

            if (res.isOk) {
                const value = res.value;
                let finalRes:VideoEntity | null = null;
                
                if(value.length !== 0) finalRes = value[0];

                return Result.ok(finalRes)
            }
            else throw new Error(res.error.message);
        } catch (error) {
            return Result.err(new InternalFailure("Failed to get events that are currently live streamed"));
        }
    }
}