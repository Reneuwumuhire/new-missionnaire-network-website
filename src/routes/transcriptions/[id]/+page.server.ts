import { error } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
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
	const label = transcript.filename
		.normalize('NFC')
		.replace(/\.pdf$/i, '')
		.replace(/\s+/g, ' ')
		.trim();
	const heading = label.replace(/^\d{4}-\d{2}-\d{2}\s+(?:[-–—]\s+)?(?=\S)/, '');
	const recordingStart = heading.search(/\s+[-–—]\s+(?=prédication\s+d(?:e\b|['’]))/i);
	const title = recordingStart > 0 ? heading.slice(0, recordingStart) : heading;
	const recordingDetails =
		recordingStart > 0 ? heading.slice(recordingStart).trim().slice(1).trim() : '';

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
