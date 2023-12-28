import { json } from "@sveltejs/kit";
import YtRepository from "@mnlib/lib/repository/youtube-videos";
import {ZodError, z} from "zod";
import type { RequestEvent } from "./$types";
const videoTypeSchema = z.enum(["predication", "song"]).optional();
const LONG_VIDEO = 600;
   
export async function GET({url}: RequestEvent){
    try {
        const videoType = videoTypeSchema.parse(url.searchParams.get("type") ?? undefined);
    let maxDuration;
    let minDuration;
    let startAfter; 
    let limit = 5;
    if(url.searchParams.has("maxResults")){
        limit = z.coerce.number().parse(url.searchParams.get("maxResults"));
    }
    if(videoType === "predication"){
        minDuration = LONG_VIDEO;
    }else if(videoType === "song"){
        maxDuration = LONG_VIDEO;
    }
    if(startAfter){
        startAfter = z.coerce.number().parse(url.searchParams.get("startAfter"));
    }
   
    
    const repo = new YtRepository();
    const videos = await repo.getVideosWithAudio({limit, maxDuration, minDuration, startAfter});
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