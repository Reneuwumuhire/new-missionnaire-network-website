import { json } from "@sveltejs/kit";
import YtRepository from "@mnlib/lib/repository/youtube-videos";
import {ZodError, z} from "zod";
const videoTypeSchema = z.enum(["predication", "song"]).optional();
const LONG_VIDEO = 600;
   
export async function GET({url}){
    try {
        const videoType = videoTypeSchema.parse(url.searchParams.get("type") ?? undefined);
    let maxDuration = undefined;
    let minDuration = undefined;
    let limit = 5;
    if(url.searchParams.has("maxResults")){
        limit = z.coerce.number().parse(url.searchParams.get("maxResults"));
    }
    if(videoType === "predication"){
        minDuration = LONG_VIDEO;
    }else if(videoType === "song"){
        maxDuration = LONG_VIDEO;
    }
   
    const repo = new YtRepository();
    const videos = await repo.getVideos({limit, maxDuration, minDuration});
    return json({
        data: videos
    });
    } catch (error) {
        let message = "error";
        if(error instanceof ZodError){
            message = error.issues.map(e=>{
                return e.message;
            }).join(", ");
        }
        else if(error instanceof Error) message = error.message;
        return json({
            message,
        }, { status: 400});
    }
}