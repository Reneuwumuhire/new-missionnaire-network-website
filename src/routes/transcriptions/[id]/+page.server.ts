import { error } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import { transcriptTitle } from '$lib/utils/transcriptTitle';
import { pageMeta } from '$lib/seo';
import { objectIdString } from '$lib/server/mongo-input';
import { getDb } from '../../../db/mongo';
import type { PDF } from '../../../core/model/pdf';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const id = objectIdString.safeParse(params.id);
	if (!id.success) error(404);

	const db = await getDb();
	const transcript = await db
		.collection<Omit<PDF, '_id'>>('pdfs')
		.findOne(
			{ _id: new ObjectId(id.data) },
			{ projection: { filename: 1, url: 1, size: 1, publishedOn: 1, videoId: 1 } }
		);
	if (!transcript) error(404);

	const videoId = objectIdString.safeParse(String(transcript.videoId ?? ''));
	const video = videoId.success
		? await db
				.collection('videos')
				.findOne({ _id: new ObjectId(videoId.data) }, { projection: { id: 1 } })
		: null;
	const { title, recordingDetails } = transcriptTitle(transcript.filename);

	return {
		id: id.data,
		title,
		recordingDetails,
		pdfUrl: transcript.url,
		size: transcript.size,
		publishedOn: transcript.publishedOn,
		videoUrl:
			typeof video?.id === 'string'
				? `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`
				: null,
		meta: pageMeta(`/transcriptions/${id.data}`, {
			title: `${title} | Missionnaire Network`
		})
	};
};
