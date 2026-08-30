import { error, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export function GET({ url }) {
	const source = url.searchParams.get('url');
	if (!source) throw error(400, 'Missing image URL');

	let imageUrl: URL;
	try {
		imageUrl = new URL(source);
	} catch {
		throw error(400, 'Invalid image URL');
	}

	const expectedHost = `${env.AWS_S3_BUCKET}.s3.${env.AWS_S3_REGION}.amazonaws.com`.toLowerCase();
	if (
		imageUrl.protocol !== 'https:' ||
		imageUrl.port !== '' ||
		imageUrl.hostname !== expectedHost
	) {
		throw error(400, 'Image host is not allowed');
	}

	redirect(302, imageUrl.toString());
}
