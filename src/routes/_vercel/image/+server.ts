import { error } from '@sveltejs/kit';
import sharp from 'sharp';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, fetch }) => {
	const source = url.searchParams.get('url');
	if (!source) throw error(400, 'Missing image URL');

	let imageUrl: URL;
	try {
		imageUrl = new URL(source);
	} catch {
		throw error(400, 'Invalid image URL');
	}

	if (imageUrl.protocol !== 'https:' || !imageUrl.hostname.endsWith('.amazonaws.com')) {
		throw error(400, 'Image host is not allowed');
	}

	if (imageUrl.username || imageUrl.password || (imageUrl.port && imageUrl.port !== '443')) {
		throw error(400, 'Invalid image URL');
	}
	const width = Number(url.searchParams.get('w') || 1080);
	const quality = Number(url.searchParams.get('q') || 50);
	if (
		!Number.isInteger(width) ||
		width < 24 ||
		width > 1920 ||
		!Number.isInteger(quality) ||
		quality < 1 ||
		quality > 90
	) {
		throw error(400, 'Invalid image size or quality');
	}

	const response = await fetch(imageUrl, {
		redirect: 'error',
		signal: AbortSignal.timeout(10_000)
	});
	if (!response.ok || !response.body) throw error(502, 'Image unavailable');
	const chunks: Uint8Array[] = [];
	let size = 0;
	// Bound the download even when the upstream omits Content-Length.
	const reader = response.body.getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.length;
			if (size > 10 * 1024 * 1024) throw error(413, 'Image too large');
			chunks.push(value);
		}
	} finally {
		await reader.cancel();
		reader.releaseLock();
	}
	const image = await sharp(Buffer.concat(chunks), { limitInputPixels: 25_000_000 })
		.rotate()
		.resize({ width, withoutEnlargement: true })
		.flatten({ background: '#ffffff' })
		.jpeg({ quality, mozjpeg: true })
		.toBuffer();
	return new Response(new Uint8Array(image), {
		headers: {
			'Content-Type': 'image/jpeg',
			'Cache-Control': 'public, max-age=86400',
			'Content-Length': String(image.length)
		}
	});
};
