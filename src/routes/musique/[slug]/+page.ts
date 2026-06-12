import GetSongsAudioUsecase from '../../../middleware/usecases/get-songs-audio';
import { pageMeta } from '$lib/seo';

export const load = async ({ params, fetch, session }: any) => {
	const slug: string = params?.slug || '';
	const pageTitle = slug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
	const songsUseCases = new GetSongsAudioUsecase();

	const songsRes = await songsUseCases.execute({
		audioCount: 40,
		startAfter: 0
	});
	console.log(songsRes);

	return {
		songs: songsRes,
		// Rendered by the root layout as the single og:*/twitter:* tag set.
		meta: pageMeta(`/musique/${slug}`, {
			title: `${pageTitle} | Musique - Missionnaire Network`,
			description: `Écoutez les cantiques de ${pageTitle} sur Missionnaire Network.`
		})
	};
};
