import { YoutubeVideo } from "@mnlib/lib/models/youtube";
import { getCollection } from "../db/collections";

export async function load({ url }: { url: URL }): Promise<{ data: YoutubeVideo[] }> {
    // get skip and limit from searchParams in request
    let skip = Number(url.searchParams.get("skip") || "0");
    if (skip < 0) skip = 0;

    const limit = 20; // Define the limit explicitly

    // get videos from MongoDB
    const videos = await getCollection("videos", skip, limit);
    const serializedVideos = videos.map((video: YoutubeVideo) => ({
        ...video,
        _id: video?._id.toString()
    }));
    return { data: serializedVideos };
}