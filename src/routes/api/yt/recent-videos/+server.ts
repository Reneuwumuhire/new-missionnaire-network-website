import { json } from "@sveltejs/kit";
import { YtSearchResultSchema } from "../../../../core/model/youtube";

import { db } from "$lib/server/firestore";

const YOUTUBE_API_URL = "https://youtube.googleapis.com/youtube/v3/search";
const YOUTUBE_CHANNEL_ID = "UCS3zqpqnCvT0SFa_jI662Kg"

const VIDEO_DURATIONS = ["long", "short", "medium"];


export const GET = async (
    req: {
        url: { search: string | string[][] | Record<string, string> | URLSearchParams | undefined; };
    }) => {
    const preferences = await db.collection("PREFERENCES").doc("YOUTUBE_API_KEY").get();
    if(!preferences.exists) {
        return json({
            success: false,
            message: "hello.."
        });
    }
    const {value: YOUTUBE_API_KEY} = preferences.data()!;
    const searchParams = new URLSearchParams(req.url.search);
    const resultSizeString = searchParams.get("resultsPerPage");
    const pageToken = searchParams.get("pageToken");
    let videoDuration = searchParams.get("videoDuration");

    let resultSize = 10;
    if (resultSizeString && !isNaN(Number(resultSizeString))) {
        resultSize = Number(resultSizeString) 
    }
    if(!videoDuration || !VIDEO_DURATIONS.includes(videoDuration) ){
        videoDuration = "long";
    }
    
    const q = searchParams.get("q"); 
   
    const apiURL = new URL(YOUTUBE_API_URL);
    apiURL.searchParams.set("part", "snippet");
    apiURL.searchParams.set("channelId", YOUTUBE_CHANNEL_ID);
    apiURL.searchParams.set("key", YOUTUBE_API_KEY);
    apiURL.searchParams.set("order", "date");
    apiURL.searchParams.set("type", "video");
    apiURL.searchParams.set("videoDuration", videoDuration);
    apiURL.searchParams.set("maxResults", resultSize.toString());
    q && apiURL.searchParams.set("q", q);
    pageToken  && apiURL.searchParams.set("pageToken", pageToken );

    const youtubeReqResult = await fetch(apiURL);
    const youtubeResultJSON = await youtubeReqResult.json();
    const reqDataResult = YtSearchResultSchema.safeParse(youtubeResultJSON);
    
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
        prevPageToken: reqDataResult.data.prevPageToken,
        nextPageToken: reqDataResult.data.nextPageToken,
        totalResults: reqData.pageInfo.totalResults,
        videos
    });
}
