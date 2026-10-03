import { pageMeta } from '$lib/seo';
import { getExtraitFeed } from '$lib/server/extraitPosts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const feed = await getExtraitFeed();

	return {
		...feed,
		meta: pageMeta('/publications', {
			title: 'Publications du canal | Missionnaire Network',
			description:
				'Retrouvez les publications complètes de notre canal, avec leur mise en forme, leurs images et leurs liens vers les ressources associées.'
		})
	};
};
