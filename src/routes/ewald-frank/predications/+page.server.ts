import { pageMeta } from '$lib/seo';
import { queryTranscriptions } from '$lib/server/transcriptions';
import { transcriptTitle } from '$lib/utils/transcriptTitle';
import { getCollection } from '../../../db/collections';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [videos, { documents }] = await Promise.all([
		getCollection('videos', 0, 8, 'Ewald Frank', 'Ewald Frank'),
		queryTranscriptions({ search: 'Ewald Frank', limit: 8 })
	]);

	return {
		videos: videos
			.filter((video) => video.id)
			.map(({ id, title, thumbnail }) => ({
				id,
				title,
				thumbnail: thumbnail?.replace(/maxresdefault|hqdefault/, 'mqdefault')
			})),
		transcripts: documents.map((doc) => ({ id: doc._id, ...transcriptTitle(doc.filename) })),
		meta: pageMeta('/ewald-frank/predications', {
			title: 'Prédications d’Ewald Frank – Vidéos et transcriptions | Missionnaire Network',
			description:
				'Regardez les prédications d’Ewald Frank à Krefeld, lisez leurs transcriptions en PDF et retrouvez ses livres, brochures et lettres circulaires.'
		})
	};
};
