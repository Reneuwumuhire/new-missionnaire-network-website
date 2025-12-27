import type { PageServerLoad } from './$types';
import { queryAudios } from '../../db/collections';

export const load: PageServerLoad = async () => {
	const fetchAudios = async () => {
		const limit = 20;
		const pageNumber = 1;
		try {
			const audios = await queryAudios({ limit, pageNumber });
			return {
				audios: audios,
				error: null
			};
		} catch (error) {
			console.error('Error fetching audio data:', error);
			return {
				audios: [],
				error: error instanceof Error ? error.message : 'Failed to fetch audio data'
			};
		}
	};

	return {
		streamed: {
			audiosRes: fetchAudios()
		}
	};
};
