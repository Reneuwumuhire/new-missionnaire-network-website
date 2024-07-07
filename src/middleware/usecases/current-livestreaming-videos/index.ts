import { Result } from "@badrap/result";
import type { UseCase } from "..";
import { InternalFailure } from "../../errors/failures";
import resolver from "../../repository/resolver";
import { z } from "zod";
import { URLInstance } from "../../repository/repo";
import { YoutubeVideoSchema, type YoutubeVideo } from "@mnlib/lib/models/youtube";

export default class GetCurrentLiveStreamingEventsUsecase implements UseCase<void, YoutubeVideo|null>{
    async execute(): Promise<Result<YoutubeVideo|null, InternalFailure>> {
        try {
            const url = URLInstance;
            url.pathname = `/api/yt/livestream`;
            const res = await resolver(url, "GET", undefined, z.array(YoutubeVideoSchema));

            if (res.isOk) {
                const value = res.value;
                let finalRes:YoutubeVideo | null = null;
                
                if(value.length !== 0) finalRes = value[0];
                
                console.log(finalRes);
                return Result.ok(finalRes)
            }
            else throw new Error(res.error.message);
        } catch (error) {
            return Result.err(new InternalFailure("Failed to get events that are currently live streamed"));
        }
    }
}