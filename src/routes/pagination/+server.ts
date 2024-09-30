import { getCollection } from "../../db/collections";

export async function GET(request: Request): Promise<Response> {
    // get skip and limit from searchParams in request
    const url = new URL(request.url);
    let skip = Number(url.searchParams.get("skip") || "0");
    if (skip < 0)
        skip = 0;

    const limit = 20; // Define limit explicitly

    // get videos from MongoDB
    const videos = await getCollection("videos", skip, limit);

    // return JSON response
    return new Response(JSON.stringify({ data: videos }));
}