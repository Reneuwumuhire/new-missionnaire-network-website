import type { AudioAsset } from '@mnlib/lib/models/media-assets';
import type { PageServerLoad } from './$types';
import SearchAudiosUsecase, {
	SearchAudioUsecaseArgsSchema
} from '@mnlib/lib/usecase/search-audios';

export const load: PageServerLoad = async () => {
	const fetchAudios = async () => {
		const limit = 20;
		const pageNumber = 1;
		const usecase = new SearchAudiosUsecase();
		try {
			const response = await usecase.execute(
				SearchAudioUsecaseArgsSchema.parse({ limit, pageNumber })
			);
			if (response.ok) {
				const audios: AudioAsset[] = response.value;
				return {
					audios: audios,
					error: null
				};
			} else {
				console.error('Error fetching audio data:', response.error);
				return {
					audios: [],
					error: response.error.message
				};
			}
		} catch (error) {
			console.error('Error fetching audio data:', error);
			return {
				audios: [],
				error: 'Failed to fetch audio data'
			};
		}
	};

	return {
		streamed: {
			audiosRes: fetchAudios()
		}
	};
};
