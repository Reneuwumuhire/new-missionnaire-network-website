import { json, error } from "@sveltejs/kit";
import type { RequestEvent } from "./$types";
import { ZodError, z } from "zod";
import SearchYtVideosUsecase from "@mnlib/lib/usecase/seach-yt-videos";
import { parseSearchParams } from "@mnlib/lib/utils/url";
import { YoutubeVideoTagSchema } from "@mnlib/lib/models/youtube";



const Params = z.object({
    limit: z.coerce.number(),
    pageNumber: z.coerce.number(),
    query: z.string()
});



export async function GET({ url }: RequestEvent) {
    try {
        const params = parseSearchParams(url, Params);
        
        return json(params);
    } catch (err) {
        let message = "That's an error :( \n failed to query videos";
        if (err instanceof ZodError) {
            message = err.issues.map(i => `${i.code}: '${i.path}' ${i.message}`).join(", ");
        } else if (err instanceof Error) {
            message = err.message;
        }
        throw error(400, message);
    }
}