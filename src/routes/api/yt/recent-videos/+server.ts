import { json } from "@sveltejs/kit";
import { YOUTUBE_API_URL, YOUTUBE_API_KEY, YOUTUBE_CHANNEL_ID } from '$env/static/private';
import { z } from "zod";
import { YtSearchResultSchema } from "../../../../core/model/youtube";



export const GET = async (req) => {
    const searchParams = new URLSearchParams(req.url.search);
    const resultSize = searchParams.get("resultsPerPage") ? Number(searchParams.get("resultsPerPage")) : 10;
   
    const apiURL = new URL(YOUTUBE_API_URL);
    apiURL.searchParams.set("part", "snippet");
    apiURL.searchParams.set("channelId", YOUTUBE_CHANNEL_ID);
    apiURL.searchParams.set("key", YOUTUBE_API_KEY);
    apiURL.searchParams.set("order", "date");
    apiURL.searchParams.set("type", "video");
    apiURL.searchParams.set("videoDuration", "long");
    apiURL.searchParams.set("maxResults", resultSize.toString());

    const youtubeReqResult = await fetch(apiURL);
    const reqDataResult = YtSearchResultSchema.safeParse(await youtubeReqResult.json());
    if(!reqDataResult.success){
        return json({
            success: false
        });
    }
    const reqData = reqDataResult.data;
    const videos = reqData.items.map(video => ({
        id: video.id.videoId,
        ...video.snippet
    }));
    

    return json({
        resultsPerPage: reqData.pageInfo.resultsPerPage,
        videos
    });
}