import { error } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import { transcriptTitle } from '$lib/utils/transcriptTitle';
import { pageMeta } from '$lib/seo';
import { objectIdString } from '$lib/server/mongo-input';
import { getReplayIdForTranscript } from '$lib/server/recordings';
import { getDb } from '../../../db/mongo';
import type { PDF } from '../../../core/model/pdf';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const id = objectIdString.safeParse(params.id);
	if (!id.success) error(404);

	const db = await getDb();
	const transcriptId = new ObjectId(id.data);
	const transcript = await db
		.collection<Omit<PDF, '_id'> & { recordingId?: ObjectId | string }>('pdfs')
		.findOne(
			{ _id: transcriptId },
			{ projection: { filename: 1, url: 1, size: 1, publishedOn: 1, videoId: 1, recordingId: 1 } }
		);
	if (!transcript) error(404);

	const videoId = objectIdString.safeParse(String(transcript.videoId ?? ''));
	const video = videoId.success
		? await db
				.collection('videos')
				.findOne({ _id: new ObjectId(videoId.data) }, { projection: { id: 1 } })
		: null;
	const { title, recordingDetails } = transcriptTitle(transcript.filename);
	const sourceVideoId = typeof video?.id === 'string' && video.id ? video.id : null;
	const replayId = await getReplayIdForTranscript(
		transcriptId.toHexString(),
		transcript.recordingId,
		sourceVideoId
	);

	return {
		id: id.data,
		title,
		recordingDetails,
		pdfUrl: transcript.url,
		size: transcript.size,
		publishedOn: transcript.publishedOn,
		replayUrl: replayId ? `/live/rediffusions/${replayId}` : null,
		videoUrl: sourceVideoId
			? `https://www.youtube.com/watch?v=${encodeURIComponent(sourceVideoId)}`
			: null,
		meta: pageMeta(`/transcriptions/${id.data}`, {
			title: `${title} | Missionnaire Network`
		})
	};
};
