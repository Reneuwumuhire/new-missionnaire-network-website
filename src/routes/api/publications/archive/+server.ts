import { json } from '@sveltejs/kit';
import archive from '$lib/data/channelPosts.json';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	json({
		posts: archive.posts.map(({ id, publishedAt, sourceTitle, excerpt }) => ({
			id,
			publishedAt,
			sourceTitle,
			excerpt
		}))
	});
