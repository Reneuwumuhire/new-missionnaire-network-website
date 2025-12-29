import GetSongsAudioUsecase from '../../../middleware/usecases/get-songs-audio';

export const load = async ({ fetch, session }: any) => {
	const songsUseCases = new GetSongsAudioUsecase();

	const songsRes = await songsUseCases.execute({
		audioCount: 40,
		startAfter: 0
	});
	console.log(songsRes);

	return {
		songs: songsRes
	};
};
