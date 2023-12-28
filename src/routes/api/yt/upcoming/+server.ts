import { json } from "@sveltejs/kit";
import YtRepository from "@mnlib/lib/repository/youtube-videos";
import {ZodError, z} from "zod";

   
export async function GET(){
   
    try {
        const repo = new YtRepository();
        const data = await repo.getUpcomingVideos();
        return json({
            data
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