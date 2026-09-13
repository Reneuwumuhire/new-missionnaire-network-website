import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { loadLibrarySource } from '$lib/server/libraryPassage';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, request, fetch }) => {
	const { asset, parts } = await loadLibrarySource(params.type, params.id, url.searchParams);
	if (!asset || !parts.some((part) => part.page)) error(404);
	const target = new URL(asset);
	const hosts = (env.LIBRARY_ASSET_HOSTS || 'missionnaire-bucket.s3.af-south-1.amazonaws.com')
		.split(',')
		.map((host) => host.trim());
	if (target.protocol !== 'https:' || target.port || !hosts.includes(target.hostname)) error(404);
	const range = request.headers.get('range');
	if (range && !/^bytes=\d*-\d*$/.test(range)) error(416);
	let upstream;
	try {
		upstream = await fetch(target, {
			redirect: 'error',
			signal: AbortSignal.timeout(30000),
			headers: range ? { Range: range } : {}
		});
	} catch {
		error(502, 'PDF unavailable');
	}
	if (![200, 206].includes(upstream.status)) {
		await upstream.body?.cancel();
		error(502, 'PDF unavailable');
	}
	const headers = new Headers({
		'content-type': 'application/pdf',
		'cache-control': 'no-store',
		'x-robots-tag': 'noindex, nofollow',
		'x-content-type-options': 'nosniff'
	});
	for (const name of ['content-length', 'content-range', 'accept-ranges']) {
		const value = upstream.headers.get(name);
		if (value) headers.set(name, value);
	}
	return new Response(upstream.body, { status: upstream.status, headers });
};
