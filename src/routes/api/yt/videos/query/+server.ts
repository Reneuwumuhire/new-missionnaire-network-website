import { json, error } from "@sveltejs/kit";
import type { RequestEvent } from "./$types";
import { ZodError, z } from "zod";
import SearchYtVideosUsecase from "@mnlib/lib/usecase/seach-yt-videos";
import { parseSearchParams } from "@mnlib/lib/utils/url";
import { YoutubeVideoTagSchema } from "@mnlib/lib/models/youtube";

const SearchTags = z.string().transform((arg, ctx) => {
    try {
        const values = arg.split(",").map(v => v.trim());
        const parsedValue = YoutubeVideoTagSchema.array().parse(values);
        return parsedValue;
    } catch (error) {
        return ctx.addIssue({
            code: "invalid_type",
            message: `search tag should be any of the following: ${Object.values(YoutubeVideoTagSchema.enum).join(", ")}`,
            expected: "array",
            received: "string",
        });
    }
});

const Params = z.object({
    searchTags: SearchTags.default("any"),
    limit: z.coerce.number(),
    pageNumber: z.coerce.number()
});



export async function GET({ url }: RequestEvent) {
    try {
        const params = parseSearchParams(url);
        const parsedParams = Params.parse(params);
        const usecase = new SearchYtVideosUsecase();
        const videos = await usecase.execute({ searchTags: ["any"], ...parsedParams });
        return json(videos);
    } catch (err) {
        let message = "That's an error :( \n failed to query videos";
        if(err instanceof ZodError){
            message = err.issues.map(i=>`${i.code}: ${i.message}`).join(", ");
        } else if (err instanceof Error){
            message = err.message;
        }
        
        throw error(400, message);
    }
}