import { error, json } from '@sveltejs/kit';

const REPOSITORY = 'Reneuwumuhire/new-missionnaire-network-website';
const API = `https://api.github.com/repos/${REPOSITORY}`;
const headers = {
	accept: 'application/vnd.github+json',
	'user-agent': 'Missionnaire-Studio-Updater'
};

export async function GET({ fetch }) {
	const releaseResponse = await fetch(`${API}/releases/latest`, { headers });
	if (!releaseResponse.ok) throw error(502, 'Latest Studio release is unavailable');
	const release = (await releaseResponse.json()) as {
		assets?: { id?: unknown; name?: unknown }[];
	};
	const asset = release.assets?.find(
		(item) => item.name === 'latest.json' && typeof item.id === 'number'
	);
	if (!asset || typeof asset.id !== 'number') throw error(502, 'Studio update manifest is missing');

	const manifestResponse = await fetch(`${API}/releases/assets/${asset.id}`, {
		headers: { ...headers, accept: 'application/octet-stream' }
	});
	if (!manifestResponse.ok) throw error(502, 'Studio update manifest is unavailable');
	const manifest = (await manifestResponse.json()) as { version?: unknown; platforms?: unknown };
	if (
		typeof manifest.version !== 'string' ||
		!manifest.platforms ||
		typeof manifest.platforms !== 'object'
	)
		throw error(502, 'Studio update manifest is invalid');

	return json(manifest, {
		headers: { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=86400' }
	});
}
