import { json } from '@sveltejs/kit';
import archive from '$lib/data/channelPosts.json';
import { recordingSourceFromLinks } from '$lib/server/extraitPosts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	json({
		posts: archive.posts.map((post) => ({
			...post,
			source: recordingSourceFromLinks(post.links)
		}))
	});
