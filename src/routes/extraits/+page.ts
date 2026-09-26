import archive from '$lib/data/channelPosts.json';
import { pageMeta } from '$lib/seo';

export const load = () => ({
	...archive,
	meta: pageMeta('/extraits', {
		title: 'Extraits des prédications | Missionnaire Network',
		description:
			'Retrouvez les extraits publiés sur notre canal, avec leurs images et les liens vers les prédications, retransmissions, vidéos et PDF.'
	})
});
