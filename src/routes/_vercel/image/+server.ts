import { error, redirect } from '@sveltejs/kit';

export function GET({ url }) {
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

	redirect(302, imageUrl.toString());
}
