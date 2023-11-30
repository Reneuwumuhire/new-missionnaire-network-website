import { json } from '@sveltejs/kit';

import { db } from '$lib/server/firestore';

const YOUTUBE_CHANNEL_ID = 'UCS3zqpqnCvT0SFa_jI662Kg';


export const GET = async (req: {
	url: { search: string | string[][] | Record<string, string> | URLSearchParams | undefined };
}) => {
	const searchParams = new URLSearchParams(req.url.search);
	const resultSizeString = searchParams.get('resultsPerPage');
	let resultSize = 1;
	if (resultSizeString && !isNaN(Number(resultSizeString))) {
		resultSize = Number(resultSizeString);
	}
	const youtubeVideosSnap = await db.collection(`/YOUTUBE_CHANNELS/${YOUTUBE_CHANNEL_ID}/YOUTUBE_VIDEOS`)
		.orderBy("publishTime", "desc")
		.limit(resultSize).get();
	const youtubeVideos = youtubeVideosSnap.docs.map((doc)=>{
		const data = doc.data();
		return {
			id: doc.id,
			channelId: YOUTUBE_CHANNEL_ID,
			...data,
			publishTime: data.publishTime.toDate(),
			publishedAt: data.publishedAt.toDate()
		};
	});
	const response = {
		resultsPerPage: resultSize,
		prevPageToken: "",
		nextPageToken: "",
		totalResults: youtubeVideos.length,
		videos: youtubeVideos
	}
	return json(response);
};
