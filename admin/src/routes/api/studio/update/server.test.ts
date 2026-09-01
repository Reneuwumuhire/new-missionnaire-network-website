import assert from 'node:assert/strict';
import test from 'node:test';
import { GET } from './+server';

test('serves the signed updater manifest through the GitHub API', async () => {
	const calls: { url: string; accept: string }[] = [];
	const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		calls.push({ url, accept: new Headers(init?.headers).get('accept') ?? '' });
		return url.endsWith('/releases/latest')
			? Response.json({ assets: [{ id: 42, name: 'latest.json' }] })
			: Response.json({ version: '0.1.9', platforms: { 'darwin-universal': {} } });
	};

	const response = await GET({ fetch: fetcher } as never);
	assert.equal(response.status, 200);
	assert.equal((await response.json()).version, '0.1.9');
	assert.deepEqual(
		calls.map((call) => call.accept),
		['application/vnd.github+json', 'application/octet-stream']
	);
});
