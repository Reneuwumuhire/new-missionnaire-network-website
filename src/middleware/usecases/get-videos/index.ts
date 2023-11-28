import { Result } from "@badrap/result";
import type { UseCase } from "..";
import { InternalFailure } from "../../errors/failures";
import resolver from "../../repository/resolver";
import { z } from "zod";
import { URLInstance } from "../../repository/repo";
import { VideosResSchema } from "../../schema/getVideosSchema";
import type { VideoEntity } from "../../entity";

export default class GetHomeVideosUsecase implements UseCase<number, VideoEntity[]>{
    async execute(videoCount: number): Promise<Result<VideoEntity[], InternalFailure>> {
        try {
            const url = URLInstance;
            url.pathname = `/api/yt/recent-videos`;
            url.searchParams.set("resultsPerPage", videoCount.toString());
            const res = await resolver(url, "GET", undefined, VideosResSchema);

            if (res.isOk) {
                return Result.ok(res.value.videos)
            }
            else throw new Error(res.error.message);
        } catch (error) {
            return Result.err(new InternalFailure("Failed to get Videos from server"));
        }
    }
}