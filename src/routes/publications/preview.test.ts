import { expect, it, vi } from 'vitest';

vi.mock('$lib/server/extraitPosts', () => ({
	getExtraitFeed: async () => ({
		posts: [
			{
				id: 'WA1',
				sourceTitle: 'First post',
				excerpt: 'First excerpt',
				text: 'First body',
				image: '/img/extraits/first.jpg'
			},
			{
				id: 'WA2',
				sourceTitle: 'Second post',
				excerpt: 'Second excerpt',
				text: 'Second body',
				image:
					'https://missionnaire-bucket.s3.af-south-1.amazonaws.com/broadcast-thumbnails/second.png'
			}
		]
	})
}));

import { load } from './+page.server';

async function preview(search: string) {
	return (await load({
		url: new URL(`https://missionnaire.net/publications${search}`)
	} as any)) as any;
}

it('provides the selected post preview while retaining the complete feed', async () => {
	const data = await preview('?post=WA1');
	expect(data.posts).toHaveLength(2);
	expect(data.selectedPostId).toBe('WA1');
	expect(data.meta).toMatchObject({
		url: 'https://missionnaire.net/publications?post=WA1',
		title: 'First post · Publication',
		description: 'First excerpt',
		image: 'https://missionnaire.net/img/extraits/first.jpg',
		type: 'article'
	});
});

it('uses the resized image endpoint for an S3 attachment', async () => {
	const data = await preview('?post=WA2');
	const image = new URL(data.meta.image);
	expect(image.pathname).toBe('/_vercel/image');
	expect(image.searchParams.get('url')).toBe(data.posts[1].image);
	expect(image.searchParams.get('w')).toBe('1080');
});

it.each(['', '?post=missing'])(
	'keeps the channel preview when no published post matches %s',
	async (search) => {
		const data = await preview(search);
		expect(data.posts).toHaveLength(2);
		expect(data.selectedPostId).toBeNull();
		expect(data.meta.image).toBe('https://missionnaire.net/img/whatsapp-channel.jpg');
		expect(data.meta.url).toBe('https://missionnaire.net/publications');
	}
);
