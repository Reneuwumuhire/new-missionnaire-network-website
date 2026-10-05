import { expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { GET } from './+server';

it('returns a resized JPEG for share crawlers instead of redirecting to the full PNG', async () => {
	const original = await sharp({
		create: { width: 1672, height: 941, channels: 3, background: '#cc7722' }
	})
		.png()
		.toBuffer();
	const fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array(original)));
	const response = await GET({
		url: new URL(
			'https://missionnaire.net/_vercel/image?url=https://missionnaire-bucket.s3.af-south-1.amazonaws.com/broadcast-thumbnails/example.png&w=1080&q=50'
		),
		fetch
	} as any);
	expect(response.status).toBe(200);
	expect(response.headers.get('content-type')).toBe('image/jpeg');
	expect(response.headers.get('location')).toBeNull();
	const bytes = Buffer.from(await response.arrayBuffer());
	expect((await sharp(bytes).metadata()).width).toBe(1080);
	expect(bytes.length).toBeLessThan(300_000);
});

it('rejects non-S3 URLs before fetching', async () => {
	const fetch = vi.fn();
	await expect(
		GET({
			url: new URL('https://missionnaire.net/_vercel/image?url=https://example.com/image.png'),
			fetch
		} as any)
	).rejects.toMatchObject({ status: 400 });
	expect(fetch).not.toHaveBeenCalled();
});
