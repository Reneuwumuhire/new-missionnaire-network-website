import { getDb } from '../../../db/mongo';
import { pageMeta } from '$lib/seo';
import type { PageServerLoad } from './$types';

const SOURCE_PLAYLIST = 'PLOpV149mUpV858n5BYcIrec6YqirjvamD';

export const load: PageServerLoad = async () => {
	const meta = pageMeta('/musique/instrumental', {
		title: 'Musique instrumentale - Missionnaire Network',
		description: 'Écoutez les hymnes au piano de Kaleb Brasee dans un espace instrumental dédié.'
	});

	try {
		const db = await getDb();
		const documents = await db
			.collection('instrumental_audio')
			.find({ source_playlist: SOURCE_PLAYLIST })
			.sort({ playlist_position: 1 })
			.toArray();
		return {
			tracks: documents.map((document) => ({
				...document,
				_id: document._id.toString(),
				uploaded_at:
					document.uploaded_at instanceof Date
						? document.uploaded_at.toISOString()
						: document.uploaded_at
			})),
			meta
		};
	} catch (error) {
		console.error('[Instrumental] Failed to load tracks:', error);
		return { tracks: [], meta };
	}
};
