import { pageMeta } from '$lib/seo';
import { getExtraitFeed } from '$lib/server/extraitPosts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const feed = await getExtraitFeed();

	return {
		...feed,
		meta: pageMeta('/extraits', {
			title: 'Extraits des prédications | Missionnaire Network',
			description:
				'Retrouvez les extraits publiés sur notre canal, avec leurs images et les liens vers les prédications, retransmissions, vidéos et PDF.'
		})
	};
};
