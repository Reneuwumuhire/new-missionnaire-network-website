import { pageMeta, SITE_URL } from '$lib/seo';
import { getExtraitFeed } from '$lib/server/extraitPosts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const feed = await getExtraitFeed();

	return {
		...feed,
		meta: pageMeta('/publications', {
			title: 'TRANSCRIPTION DES PRÉDICATIONS | Missionnaire Network',
			description:
				'Cette chaîne publiera principalement les extraits des transcriptions des prédications de Frère William Marrion BRANHAM et les extraits des prédications de Frère Ewald Frank en français. QUE DIEU VOUS BÉNISSE !',
			image: `${SITE_URL}/img/whatsapp-channel.jpg`,
			imageWidth: 640,
			imageHeight: 640
		})
	};
};
