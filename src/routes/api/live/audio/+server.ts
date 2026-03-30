import { getLiveAudioSourceUrl } from '$lib/server/live-audio';

const PASSTHROUGH_HEADERS = [
	'accept-ranges',
	'content-length',
	'content-range',
	'icy-br',
	'icy-description',
	'icy-genre',
	'icy-metaint',
	'icy-name',
	'icy-pub',
	'icy-url'
];

export async function GET({ fetch, request }) {
	const sourceUrl = getLiveAudioSourceUrl();
	const range = request.headers.get('range');

	try {
		const upstream = await fetch(sourceUrl, {
			method: 'GET',
			headers: range
				? {
						Range: range
				  }
				: undefined
		});

		if (!upstream.ok || !upstream.body) {
			return new Response('Live audio stream unavailable', {
				status: 503,
				headers: {
					'Cache-Control': 'no-store'
				}
			});
		}

		const headers = new Headers({
			'Cache-Control': 'no-store',
			'Content-Type': upstream.headers.get('content-type') ?? 'audio/mpeg'
		});

		for (const header of PASSTHROUGH_HEADERS) {
			const value = upstream.headers.get(header);
			if (value) {
				headers.set(header, value);
			}
		}

		return new Response(upstream.body, {
			status: upstream.status,
			headers
		});
	} catch (error) {
		console.error('[LiveAudio] Proxy error:', error);
		return new Response('Live audio stream unavailable', {
			status: 503,
			headers: {
				'Cache-Control': 'no-store'
			}
		});
	}
}
